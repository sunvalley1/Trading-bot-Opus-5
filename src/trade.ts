/**
 * Trading engine for Seer markets.
 *
 * The methodology this implements (and that `skills/seer-trade-market/SKILL.md` drives):
 *   1. research the question           -> done by the agent, not here
 *   2. own estimate p[]                -> given to this module, sums to 1 over all outcomes incl. Invalid
 *   3. reconcile with the market       -> `blend()`: a log-opinion pool of p[] and the market's own prices,
 *                                         weighted by how much we trust each
 *   4. trade                           -> `quoteRoutes()` + `planTrade()`: real fills from the real pools,
 *                                         edge measured against the price we would ACTUALLY pay, fractional
 *                                         Kelly sizing, and a hard cap on how much of a pool we eat
 *
 * Two things about Seer make naive sizing wrong, and both are handled here:
 *
 *  - Prices come from one thin concentrated-liquidity pool per outcome. The spot price is what the last
 *    trade left behind, not what the next trade gets. Every number below that matters is a QUOTE for the
 *    actual size, never the spot price.
 *
 *  - A complete set (one of every outcome) is always mintable from, and redeemable for, 1 collateral. So
 *    there are two ways to get exposure to an outcome: buy its token in its own pool, or split collateral
 *    into a complete set and sell the outcomes you do not want. When a pool is thin on the side you need
 *    but its siblings are deep, the second route is far cheaper. `quoteRoutes` prices both and the planner
 *    takes whichever actually fills better.
 */
import { formatUnits, isAddressEqual, parseUnits, zeroAddress, type Address, type PublicClient } from "viem";
import { SEER_ADDRESSES, type ChainId } from "./config.js";
import { erc20FullAbi, getDex, poolActivity, quoteExactIn, readOutcomePool, type OutcomePool, type PoolActivity } from "./dex.js";
import { readMarket } from "./market-view.js";

// ---------------------------------------------------------------- snapshot

export interface MarketSnapshot {
  chainId: ChainId;
  market: Address;
  name: string;
  /** every outcome, Invalid included (Seer appends it) */
  outcomes: string[];
  invalidIndex: number;
  collateral: Address;
  collateralSymbol: string;
  collateralDecimals: number;
  pools: OutcomePool[];
  /** raw pool prices, collateral per outcome token; undefined where there is no pool */
  spot: (number | undefined)[];
  /** spot prices rescaled to sum to 1 (missing pools treated as 0) - the market's implied probabilities */
  implied: number[];
  /** sum of the raw spot prices: >1 means a complete set is dearer than 1 collateral, <1 means cheaper */
  spotSum: number;
  payoutReported: boolean;
  /**
   * True when at least one outcome pool still has active liquidity.
   *
   * A drained pool keeps its last sqrt price forever, so `spot` stays at whatever the final trade left
   * behind and looks perfectly normal. app.seer.pm's own `liquidityUSD` is an indexed value and can stay
   * stale for hours after the liquidity is gone. Both will happily tell you a dead market is worth $2,000.
   * This flag is read from the pools themselves and is the only one of the three that can be trusted.
   */
  tradeable: boolean;
}

export async function snapshot(client: PublicClient, chainId: ChainId, market: Address): Promise<MarketSnapshot> {
  const info = await readMarket(client, chainId, market);
  const outcomes = [...info.outcomes];
  const collateral = info.collateralToken;
  const [collateralSymbol, collateralDecimals] = await Promise.all([
    client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "symbol" }).catch(() => "?"),
    client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "decimals" }).catch(() => 18),
  ]);
  const pools: OutcomePool[] = [];
  for (const [i, token] of info.wrappedTokens.entries()) {
    pools.push(await readOutcomePool(client, chainId, i, outcomes[i] ?? "?", token, collateral));
  }
  const spot = pools.map((p) => p.price);
  const spotSum = spot.reduce<number>((a, x) => a + (x ?? 0), 0);
  const implied = spot.map((x) => (spotSum > 0 ? (x ?? 0) / spotSum : 0));
  return {
    chainId,
    market,
    name: info.marketName,
    outcomes,
    invalidIndex: outcomes.findIndex((o) => /^invalid/i.test(o)),
    collateral,
    collateralSymbol,
    collateralDecimals: Number(collateralDecimals),
    pools,
    spot,
    implied,
    spotSum,
    payoutReported: info.payoutReported,
    tradeable: pools.some((p) => p.liquidity > 0n),
  };
}

// ---------------------------------------------------------------- step 3: reconcile

/**
 * Log-opinion pool: q_i proportional to p_i^w * m_i^(1-w), renormalized.
 *
 * `w` is how much weight our own research keeps. It is the single most consequential number in the whole
 * pipeline, so the skill makes the agent justify it rather than defaulting:
 *   w = 0.8  the evidence is close to decisive and clearly is not in the price yet
 *   w = 0.5  solid research against a thin market with few and probably uninformed participants
 *   w = 0.25 default: a real market with real participants who may well know things we do not
 *   w = 0.1  we are largely guessing and the market is the better prior
 *
 * Zero market prices (no pool) contribute nothing, so an outcome the market never priced keeps our estimate.
 */
export function blend(own: number[], market: number[], w: number): number[] {
  if (own.length !== market.length) throw new Error("blend(): own and market must have the same length");
  if (!(w >= 0 && w <= 1)) throw new Error("blend(): weight must be between 0 and 1");
  const EPS = 1e-6;
  const raw = own.map((p, i) => {
    const m = market[i];
    const pi = Math.min(Math.max(p, EPS), 1 - EPS);
    if (!(m > 0)) return pi; // the market never priced this outcome: keep our own view
    const mi = Math.min(Math.max(m, EPS), 1 - EPS);
    return Math.pow(pi, w) * Math.pow(mi, 1 - w);
  });
  const s = raw.reduce((a, x) => a + x, 0);
  return raw.map((x) => x / s);
}

export function normalize(xs: number[]): number[] {
  const s = xs.reduce((a, x) => a + x, 0);
  if (!(s > 0)) throw new Error("normalize(): values must sum to something positive");
  return xs.map((x) => x / s);
}

// ---------------------------------------------------------------- routes and quotes

export type RouteKind = "direct" | "split" | "fade";

export interface RouteQuote {
  kind: RouteKind;
  /** the outcome we are long; for `fade` it is the outcome being SOLD SHORT */
  targetIndex: number;
  /** outcome indexes we end up holding (for `split`, everything we did not sell) */
  retained: number[];
  /** collateral actually spent, in wei */
  collateralIn: bigint;
  /** outcome tokens received of EACH retained outcome, in wei (a complete set gives the same amount of each) */
  tokensOut: bigint;
  /** collateralIn / tokensOut - what we really pay per token, slippage included */
  avgPrice: number;
  /** spot price of the target outcome before the trade, for reference */
  spotPrice: number;
  /** avgPrice / spotPrice - 1 */
  slippage: number;
  /** legs that could not be quoted (a sibling pool too thin to absorb the sale) */
  failed: string[];
}

const ZERO_QUOTE_REASON = "pool returned no quote at this size";

/**
 * Buy `targetIndex` by swapping collateral straight into that outcome's pool.
 */
export async function quoteDirect(client: PublicClient, snap: MarketSnapshot, targetIndex: number, collateralIn: bigint): Promise<RouteQuote | null> {
  const pool = snap.pools[targetIndex];
  const spotPrice = snap.spot[targetIndex] ?? 0;
  if (!pool?.exists || collateralIn <= 0n) return null;
  const out = await quoteExactIn(client, snap.chainId, snap.collateral, pool.token, collateralIn, pool.fee);
  if (out <= 0n) return { kind: "direct", targetIndex, retained: [targetIndex], collateralIn, tokensOut: 0n, avgPrice: Number.POSITIVE_INFINITY, spotPrice, slippage: Number.POSITIVE_INFINITY, failed: [pool.outcome + ": " + ZERO_QUOTE_REASON] };
  const avgPrice = Number(formatUnits(collateralIn, snap.collateralDecimals)) / Number(formatUnits(out, 18));
  return {
    kind: "direct",
    targetIndex,
    retained: [targetIndex],
    collateralIn,
    tokensOut: out,
    avgPrice,
    spotPrice,
    slippage: spotPrice > 0 ? avgPrice / spotPrice - 1 : Number.POSITIVE_INFINITY,
    failed: [],
  };
}

/**
 * Buy `targetIndex` by splitting `sets` collateral into a complete set and selling every outcome in
 * `sell` back into its own pool. What is left (target plus anything unsellable, typically Invalid, which
 * has no pool) is the position, and the net collateral spent is the real cost.
 *
 * This is the route that matters when the target's own pool is thin: selling INTO a deep sibling pool moves
 * the price far less than buying OUT of a shallow one.
 */
export async function quoteSplit(client: PublicClient, snap: MarketSnapshot, targetIndex: number, sets: bigint, sellIndexes?: number[]): Promise<RouteQuote | null> {
  if (sets <= 0n) return null;
  const spotPrice = snap.spot[targetIndex] ?? 0;
  const toSell = (sellIndexes ?? snap.outcomes.map((_, i) => i)).filter((i) => i !== targetIndex && snap.pools[i]?.exists);
  const failed: string[] = [];
  let proceeds = 0n;
  const retained = [targetIndex];
  for (const i of snap.outcomes.map((_, k) => k)) {
    if (i === targetIndex) continue;
    if (!toSell.includes(i)) {
      retained.push(i); // kept on purpose, or no pool to sell it into
      if (!snap.pools[i]?.exists) failed.push(snap.outcomes[i] + ": no pool, kept (pays only if the market resolves to it)");
      continue;
    }
    const pool = snap.pools[i]!;
    const got = await quoteExactIn(client, snap.chainId, pool.token, snap.collateral, sets, pool.fee);
    if (got <= 0n) {
      retained.push(i);
      failed.push(snap.outcomes[i] + ": " + ZERO_QUOTE_REASON + ", kept");
      continue;
    }
    proceeds += got;
  }
  const net = sets - proceeds;
  if (net <= 0n) {
    // selling the rest returned more than the split cost: that is free money, not a trade with a price
    return { kind: "split", targetIndex, retained, collateralIn: 0n, tokensOut: sets, avgPrice: 0, spotPrice, slippage: -1, failed };
  }
  const avgPrice = Number(formatUnits(net, snap.collateralDecimals)) / Number(formatUnits(sets, 18));
  const kept = retained.sort((a, b) => a - b);
  // A bundle's honest reference price is what the WHOLE bundle costs at spot - the sum over everything we
  // keep - not the target leg alone. Getting this wrong makes a multi-leg short look like 200% slippage and
  // silently rejects a good trade.
  const bundleSpot = kept.reduce((a, i) => a + (snap.spot[i] ?? 0), 0);
  return {
    kind: "split",
    targetIndex,
    retained: kept,
    collateralIn: net,
    tokensOut: sets,
    avgPrice,
    spotPrice: bundleSpot > 0 ? bundleSpot : spotPrice,
    slippage: bundleSpot > 0 ? avgPrice / bundleSpot - 1 : Number.POSITIVE_INFINITY,
    failed,
  };
}

/**
 * Sell SHORT one outcome: mint `sets` complete sets and sell ONLY `fadeIndex`, keeping every other
 * outcome. The resulting bundle pays `sets` unless `fadeIndex` wins, so it is exactly a short position on
 * that one outcome - the only way to express "this outcome is too expensive" on a venue with no borrow.
 *
 * On a multi-outcome market this is frequently the ONLY route with real edge. A three-way market whose
 * favourite is 15 points too dear offers nothing on the long side (every other outcome may be fairly
 * priced individually), but fading the favourite collects the whole mispricing in one position.
 */
export async function quoteFade(client: PublicClient, snap: MarketSnapshot, fadeIndex: number, sets: bigint): Promise<RouteQuote | null> {
  if (!snap.pools[fadeIndex]?.exists) return null;
  // keep everything except fadeIndex: target is any retained outcome, used only for labelling
  const keep = snap.outcomes.map((_, i) => i).filter((i) => i !== fadeIndex);
  if (!keep.length) return null;
  const q = await quoteSplit(client, snap, keep[0], sets, [fadeIndex]);
  if (!q) return null;
  // quoteSplit already priced the bundle correctly (spotPrice = sum over retained); only the label changes.
  return { ...q, kind: "fade", targetIndex: fadeIndex };
}

// ---------------------------------------------------------------- sizing

export interface SizedTrade extends RouteQuote {
  /** probability the retained bundle pays out = sum of our blended estimates over `retained` */
  winProb: number;
  /** payout per collateral staked if it wins */
  payoffRatio: number;
  /** expected profit in collateral units */
  ev: number;
  /** ev / collateral staked */
  evPct: number;
  /** full-Kelly fraction of bankroll */
  kelly: number;
  /** the fraction we actually use (kelly * kellyFraction), after every cap */
  stakeFraction: number;
  /** why the size ended up where it did */
  limitedBy: string;
}

export interface SizingLimits {
  /** total capital the strategy is allowed to think in terms of, in collateral units */
  bankroll: number;
  /** fraction of full Kelly. 0.25 is the house default: Kelly assumes the probability is right, and ours is not */
  kellyFraction: number;
  /** never stake more than this fraction of the bankroll on a single market */
  maxPerMarket: number;
  /** reject a fill whose average price is this much worse than spot (0.15 = 15%) */
  maxSlippage: number;
  /** minimum edge (blended probability minus the price we actually pay) worth trading at all */
  minEdge: number;
}

export const DEFAULT_LIMITS: SizingLimits = {
  bankroll: 0,
  kellyFraction: 0.25,
  maxPerMarket: 0.2,
  maxSlippage: 0.15,
  minEdge: 0.05,
};

/** Turns a quote into the economics of the bet it actually is: stake `collateralIn`, win `tokensOut` with probability `winProb`. */
export function evaluate(q: RouteQuote, blended: number[], limits: SizingLimits): SizedTrade {
  const stake = Number(formatUnits(q.collateralIn, 18));
  const payout = Number(formatUnits(q.tokensOut, 18));
  const winProb = q.retained.reduce((a, i) => a + (blended[i] ?? 0), 0);
  const payoffRatio = stake > 0 ? payout / stake : Number.POSITIVE_INFINITY;
  const ev = winProb * payout - stake;
  const b = payoffRatio - 1; // net odds
  const kelly = b > 0 ? (winProb * payoffRatio - 1) / b : 0;
  return {
    ...q,
    winProb,
    payoffRatio,
    ev,
    evPct: stake > 0 ? ev / stake : Number.POSITIVE_INFINITY,
    kelly,
    stakeFraction: Math.max(0, Math.min(kelly * limits.kellyFraction, limits.maxPerMarket)),
    limitedBy: "",
  };
}

export interface LadderRung {
  /** collateral offered, in collateral units */
  size: number;
  direct: SizedTrade | null;
  split: SizedTrade | null;
  best: SizedTrade | null;
}

export const DEFAULT_LADDER = [1, 2, 5, 10, 25, 50, 100, 250, 500];

/**
 * Prices both routes at a range of sizes. This is the depth curve the planner walks: on these pools the
 * average fill price can double between a 5 and a 50 unit order, so there is no such thing as "the price".
 */
export async function ladder(client: PublicClient, snap: MarketSnapshot, targetIndex: number, blended: number[], limits: SizingLimits, sizes = DEFAULT_LADDER): Promise<LadderRung[]> {
  const rungs: LadderRung[] = [];
  for (const size of sizes) {
    const wei = parseUnits(String(size), snap.collateralDecimals);
    // `direct` spends `size` collateral; `split` mints `size` sets and sells the rest, so its net spend is smaller.
    const [d, s] = await Promise.all([quoteDirect(client, snap, targetIndex, wei), quoteSplit(client, snap, targetIndex, wei)]);
    const direct = d ? evaluate(d, blended, limits) : null;
    const split = s ? evaluate(s, blended, limits) : null;
    const usable = [direct, split].filter((x): x is SizedTrade => !!x && Number.isFinite(x.avgPrice) && x.tokensOut > 0n);
    const best = usable.length ? usable.reduce((a, x) => (x.avgPrice < a.avgPrice ? x : a)) : null;
    rungs.push({ size, direct, split, best });
  }
  return rungs;
}

/** Depth curve for selling one outcome short (see `quoteFade`). */
export async function fadeLadder(client: PublicClient, snap: MarketSnapshot, fadeIndex: number, blended: number[], limits: SizingLimits, sizes = DEFAULT_LADDER): Promise<LadderRung[]> {
  const rungs: LadderRung[] = [];
  for (const size of sizes) {
    const q = await quoteFade(client, snap, fadeIndex, parseUnits(String(size), snap.collateralDecimals));
    const t = q && Number.isFinite(q.avgPrice) && q.tokensOut > 0n ? evaluate(q, blended, limits) : null;
    rungs.push({ size, direct: null, split: t, best: t });
  }
  return rungs;
}

/**
 * Picks the biggest rung that still clears every limit. Walking the ladder rather than solving analytically
 * keeps the decision honest: the number we compare against the edge is a real quote for a real size.
 */
export function planTrade(rungs: LadderRung[], blended: number[], targetIndex: number, limits: SizingLimits): { trade: SizedTrade | null; rejected: string[] } {
  const rejected: string[] = [];
  let chosen: SizedTrade | null = null;
  for (const rung of rungs) {
    const t = rung.best;
    if (!t || t.tokensOut === 0n) {
      rejected.push(rung.size + ": no fill");
      continue;
    }
    const edge = t.winProb - t.avgPrice;
    const stake = Number(formatUnits(t.collateralIn, 18));
    const maxStake = limits.bankroll * Math.min(t.kelly * limits.kellyFraction, limits.maxPerMarket);
    if (edge < limits.minEdge) {
      rejected.push(rung.size + ": edge " + edge.toFixed(3) + " below the " + limits.minEdge + " floor (fill " + t.avgPrice.toFixed(3) + ")");
      continue;
    }
    if (t.slippage > limits.maxSlippage) {
      rejected.push(rung.size + ": slippage " + (t.slippage * 100).toFixed(1) + "% over the " + (limits.maxSlippage * 100).toFixed(0) + "% cap");
      continue;
    }
    if (stake > maxStake) {
      rejected.push(rung.size + ": stake " + stake.toFixed(2) + " over the Kelly/exposure cap of " + maxStake.toFixed(2));
      continue;
    }
    chosen = { ...t, limitedBy: "" };
  }
  if (chosen) {
    const stake = Number(formatUnits(chosen.collateralIn, 18));
    const maxStake = limits.bankroll * Math.min(chosen.kelly * limits.kellyFraction, limits.maxPerMarket);
    chosen.limitedBy = stake >= maxStake * 0.9 ? "Kelly/exposure cap" : chosen.slippage >= limits.maxSlippage * 0.9 ? "pool depth (slippage)" : "top of the ladder";
  }
  return { trade: chosen, rejected };
}

// ---------------------------------------------------------------- complete-set arbitrage

/**
 * The riskless leg, if it is there. A complete set costs exactly 1 collateral to mint and always redeems for
 * exactly 1, so whenever the pools price the set away from 1 there is a trade that does not care who wins:
 *   sum of buy prices  < 1  -> buy one of each, merge, keep the difference
 *   sum of sell prices > 1  -> split, sell every leg, keep the difference
 * Worth checking before any opinion-based trade: it needs no forecast at all.
 */
export async function completeSetArb(client: PublicClient, snap: MarketSnapshot, size: number): Promise<{ buyAll: number | null; sellAll: number | null; note: string }> {
  const wei = parseUnits(String(size), snap.collateralDecimals);
  const missing = snap.pools.filter((p) => !p.exists);
  let buyCost = 0;
  let sellProceeds = 0;
  let buyable = true;
  for (const p of snap.pools) {
    if (!p.exists) {
      buyable = false; // an outcome with no pool cannot be bought, so the set cannot be assembled by buying
      continue;
    }
    const need = await quoteExactIn(client, snap.chainId, snap.collateral, p.token, wei, p.fee);
    if (need <= 0n) buyable = false;
    const got = await quoteExactIn(client, snap.chainId, p.token, snap.collateral, wei, p.fee);
    sellProceeds += Number(formatUnits(got, snap.collateralDecimals));
    if (need > 0n) buyCost += Number(formatUnits(wei, snap.collateralDecimals)) * (Number(formatUnits(wei, 18)) / Number(formatUnits(need, 18)));
  }
  return {
    buyAll: buyable ? size - buyCost : null,
    sellAll: sellProceeds - size,
    note: missing.length ? "no pool for: " + missing.map((p) => p.outcome).join(", ") : "",
  };
}

// ---------------------------------------------------------------- formatting

const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(1).padStart(5) + "%" : "    -") ;

export function describeSnapshot(snap: MarketSnapshot): string {
  const dex = getDex(snap.chainId);
  const w = Math.max(10, ...snap.outcomes.map((o) => Math.min(o.length, 52)));
  const lines: string[] = [];
  lines.push("MARKET   " + snap.market + "  (chain " + snap.chainId + ", " + dex.name + ")");
  lines.push(snap.name);
  lines.push("");
  lines.push("collateral " + snap.collateralSymbol + " " + snap.collateral + (snap.payoutReported ? "   [PAYOUT ALREADY REPORTED]" : ""));
  lines.push("");
  lines.push("#  " + "outcome".padEnd(w) + "   spot   implied  pool depth (outcome / collateral)   pool");
  for (const p of snap.pools) {
    const label = (p.outcome.length > 52 ? p.outcome.slice(0, 49) + "..." : p.outcome).padEnd(w);
    if (!p.exists) {
      lines.push(p.index + "  " + label + "     -        -    no pool");
      continue;
    }
    const depth = Number(formatUnits(p.outcomeBalance, 18)).toFixed(2).padStart(10) + " / " + Number(formatUnits(p.collateralBalance, snap.collateralDecimals)).toFixed(2).padStart(10);
    lines.push(
      p.index + "  " + label + "  " + (p.price ?? 0).toFixed(4) + "  " + pct(snap.implied[p.index]) + "  " + depth + "   " + p.pool + (p.liquidity === 0n ? "   DRAINED" : ""),
    );
  }
  lines.push("");
  lines.push("spot prices sum to " + snap.spotSum.toFixed(4) + (Math.abs(snap.spotSum - 1) > 0.02 ? "  <- a complete set is mispriced against its 1.0000 mint/redeem value" : ""));
  if (!snap.tradeable) {
    lines.push("");
    lines.push("*** NOT TRADEABLE: every outcome pool has zero active liquidity. ***");
    lines.push("    The prices above are the last trade's leftovers - a drained pool keeps its final price forever,");
    lines.push("    so it still looks like a normal quote. app.seer.pm's own liquidity figure is indexed and can stay");
    lines.push("    stale for hours after the money has gone; only the pool's own liquidity, read here, can be trusted.");
    lines.push("    Nothing can be bought or sold on this market until somebody provides liquidity again.");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- activity: has anyone actually traded?

export interface MarketActivity {
  fromBlock: bigint;
  toBlock: bigint;
  /** one entry per outcome, undefined where there is no pool */
  perPool: (PoolActivity | undefined)[];
  swaps: number;
  volume: bigint;
  traders: number;
  lastSwapBlock?: bigint;
  /** unix seconds of the last swap's block, when there was one */
  lastSwapAt?: number;
}

/**
 * Swap history of every outcome pool since `fromBlock` (normally the block the market was created in). The
 * question it answers is the one open interest cannot: how many fills, for how much, for how many addresses,
 * and how far each price has moved from where the creator seeded it. Read-only and somewhat slow (one log
 * query per 10k blocks per pool), so `snapshot()` does not include it; `npm run market` calls it separately.
 */
export async function marketActivity(client: PublicClient, snap: MarketSnapshot, fromBlock: bigint): Promise<MarketActivity> {
  const toBlock = await client.getBlockNumber();
  const perPool: (PoolActivity | undefined)[] = [];
  const traders = new Set<string>();
  let swaps = 0;
  let volume = 0n;
  let lastSwapBlock: bigint | undefined;
  for (const p of snap.pools) {
    if (!p.exists) {
      perPool.push(undefined);
      continue;
    }
    const a = await poolActivity(client, p.pool, p.outcomeIsToken0, fromBlock, toBlock);
    perPool.push(a);
    swaps += a.swaps;
    volume += a.volume;
    for (const t of a.traders) traders.add(t);
    if (a.lastSwapBlock !== undefined && (lastSwapBlock === undefined || a.lastSwapBlock > lastSwapBlock)) lastSwapBlock = a.lastSwapBlock;
  }
  let lastSwapAt: number | undefined;
  if (lastSwapBlock !== undefined) {
    const b = await client.getBlock({ blockNumber: lastSwapBlock }).catch(() => undefined);
    if (b) lastSwapAt = Number(b.timestamp);
  }
  return { fromBlock, toBlock, perPool, swaps, volume, traders: traders.size, lastSwapBlock, lastSwapAt };
}

export function describeActivity(snap: MarketSnapshot, act: MarketActivity): string {
  const lines: string[] = [];
  const vol = Number(formatUnits(act.volume, snap.collateralDecimals));
  const age = act.lastSwapAt !== undefined ? ((Date.now() / 1000 - act.lastSwapAt) / 3600).toFixed(1) + " h ago" : "never";
  lines.push(
    "TRADED           " + act.swaps + " swap" + (act.swaps === 1 ? "" : "s") + "   " + vol.toFixed(2) + " " + snap.collateralSymbol + " volume   " +
      act.traders + " trader" + (act.traders === 1 ? "" : "s") + "   last trade " + age +
      "   (Swap events on the outcome pools since the market was created, block " + act.fromBlock + ")",
  );
  if (act.swaps === 0) {
    lines.push("                 nobody has traded: every price is exactly what the creator seeded, and carries no more information than that");
  }
  const w = Math.max(10, ...snap.outcomes.map((o) => Math.min(o.length, 40)));
  lines.push("  " + "outcome".padEnd(w) + "   seed -> now         swaps  buys/sells   volume");
  for (const p of snap.pools) {
    const a = act.perPool[p.index];
    if (!p.exists || !a) continue;
    const label = (p.outcome.length > 40 ? p.outcome.slice(0, 37) + "..." : p.outcome).padEnd(w);
    const seed = a.seedPrice !== undefined ? a.seedPrice.toFixed(4) : "   ?  ";
    const now = p.price !== undefined ? p.price.toFixed(4) : "   -  ";
    const moved = a.seedPrice !== undefined && p.price !== undefined ? ((p.price - a.seedPrice) * 100).toFixed(1).padStart(6) + " pts" : "";
    lines.push(
      "  " + label + "   " + seed + " -> " + now + " " + moved.padEnd(11) + String(a.swaps).padStart(5) + "  " + (a.buys + "/" + a.sells).padStart(9) + "   " +
        Number(formatUnits(a.volume, snap.collateralDecimals)).toFixed(2).padStart(9),
    );
  }
  return lines.join("\n");
}

export function describeLadder(snap: MarketSnapshot, targetIndex: number, rungs: LadderRung[], blended: number[]): string {
  const lines: string[] = [];
  const q = blended[targetIndex];
  lines.push("DEPTH  buying \"" + snap.outcomes[targetIndex] + "\"   (blended estimate for this outcome: " + (q * 100).toFixed(1) + "%)");
  lines.push("size   route   net cost   tokens      avg fill  slippage   wins if            p(win)   edge     EV      EV%");
  for (const r of rungs) {
    const t = r.best;
    if (!t) {
      lines.push(String(r.size).padStart(4) + "   -       no fill");
      continue;
    }
    const stake = Number(formatUnits(t.collateralIn, 18));
    const tokens = Number(formatUnits(t.tokensOut, 18));
    const winsIf = t.retained.length === 1 ? snap.outcomes[t.retained[0]] : t.retained.map((i) => snap.outcomes[i]).join(" or ");
    lines.push(
      String(r.size).padStart(4) +
        "   " + t.kind.padEnd(6) +
        "  " + stake.toFixed(2).padStart(8) +
        "  " + tokens.toFixed(2).padStart(9) +
        "   " + t.avgPrice.toFixed(4) +
        "  " + pct(t.slippage) +
        "   " + (winsIf.length > 16 ? winsIf.slice(0, 13) + "..." : winsIf).padEnd(16) +
        "  " + pct(t.winProb) +
        "  " + pct(t.winProb - t.avgPrice) +
        "  " + t.ev.toFixed(2).padStart(7) +
        "  " + pct(t.evPct),
    );
  }
  return lines.join("\n");
}

/** Seer Router address for the chain, used for split/merge/redeem. */
export function seerRouter(chainId: ChainId): Address {
  const r = SEER_ADDRESSES[chainId].Router;
  if (!r || isAddressEqual(r, zeroAddress)) throw new Error("no Seer Router configured for chain " + chainId);
  return r;
}
