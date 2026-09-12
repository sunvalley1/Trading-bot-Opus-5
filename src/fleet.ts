/**
 * `npm run fleet -- fleet.json [--bankroll 1000] [--max-total 0.5] [--dry-run]`
 *
 * Sizes several markets on ONE event as a single position, which is what they actually are.
 *
 * Per-market Kelly does not compose. Four markets that all resolve off the same coinholder poll share one
 * failure mode: the poll does not happen, does not reach quorum, or is not published in a form the oracle can
 * read - and then every one of them resolves Invalid at the same time. Sizing each market as if that risk were
 * independent overstates how much can safely be at risk in total, sometimes by a lot.
 *
 * What this does that `plan` cannot:
 *   1. takes a common-factor probability (the event itself failing) and applies it once, not once per market
 *   2. caps TOTAL exposure across the fleet, scaling every position down proportionally if it binds
 *   3. reports the correlated worst case: what the whole book loses if the common factor hits
 *   4. credits the hedge - positions taken via `split` keep their Invalid tokens, which pay out precisely in
 *      the common-factor scenario, so a book built that way is far less exposed to it than it looks
 *
 * Input JSON:
 * {
 *   "commonFactor": { "label": "NU7 poll never resolves cleanly", "probability": 0.04 },
 *   "markets": [
 *     { "ref": "<address|slug|URL>", "chain": 10, "own": [0.7, 0.27, 0.03], "weight": 0.4, "note": "..." }
 *   ]
 * }
 *
 * `own` is per outcome in the market's own order, Invalid last, summing to 1. It is the agent's researched
 * estimate CONDITIONAL on nothing - the common factor is applied here, so do not double-count it: state the
 * Invalid probability you would give if the event resolved normally, and let this redistribute.
 *
 * Read-only: prints a plan and the exact `npm run trade` commands. Sends nothing.
 */
import { readFileSync } from "node:fs";
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId, type ChainId } from "./config.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { blend, DEFAULT_LADDER, DEFAULT_LIMITS, ladder, normalize, planTrade, snapshot, type SizedTrade, type SizingLimits } from "./trade.js";

interface FleetSpec {
  /**
   * The one thing that can decide every market in the fleet at once - the poll not running, not reaching
   * quorum, not being published. `resolvesTo` says WHICH outcome that scenario produces, because it is not
   * always Invalid and assuming so inverts the hedge:
   *   "invalid"  the markets go Invalid (the usual case for a question that becomes unanswerable)
   *   <index>    the markets resolve to that outcome. Zcash's retroactive grants work this way: the
   *              programme's published criteria make a quorum failure resolve NO, not Invalid, so a "No"
   *              position is hedged against the common factor and a "Yes" position is doubly exposed.
   * Per-market `resolvesTo` overrides the fleet-level one.
   */
  commonFactor?: { label: string; probability: number; resolvesTo?: number | "invalid" };
  markets: Array<{ ref: string; chain?: number; own: number[]; weight?: number; note?: string; resolvesTo?: number | "invalid" }>;
}

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file) {
  console.error("usage: npm run fleet -- <fleet.json> [--bankroll 1000] [--kelly 0.25] [--max-total 0.5] [--max-per-market 0.2]");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(file, "utf8")) as FleetSpec;
const bankroll = Number(args.bankroll ?? 0);
if (!(bankroll > 0)) {
  console.error("--bankroll must be a positive number. Sizing is meaningless without it.");
  process.exit(2);
}
const maxTotal = Number(args["max-total"] ?? 0.5); // fraction of bankroll allowed at risk across the whole fleet
const limits: SizingLimits = {
  bankroll,
  kellyFraction: Number(args.kelly ?? DEFAULT_LIMITS.kellyFraction),
  maxPerMarket: Number(args["max-per-market"] ?? DEFAULT_LIMITS.maxPerMarket),
  maxSlippage: Number(args["max-slippage"] ?? DEFAULT_LIMITS.maxSlippage),
  minEdge: Number(args["min-edge"] ?? DEFAULT_LIMITS.minEdge),
};
const cf = spec.commonFactor;
const cfP = cf?.probability ?? 0;
if (!(cfP >= 0 && cfP < 1)) {
  console.error("commonFactor.probability must be between 0 and 1.");
  process.exit(2);
}

console.log("FLEET  " + spec.markets.length + " market(s), bankroll " + bankroll + ", " + limits.kellyFraction + " Kelly");
if (cf) console.log("COMMON FACTOR  \"" + cf.label + "\"  p = " + (cfP * 100).toFixed(1) + "%  - applied once across the fleet, not once per market");
console.log("");

interface Row {
  name: string;
  url: string;
  ref: string;
  chainId: ChainId;
  address: string;
  outcomes: string[];
  invalidIndex: number;
  blended: number[];
  trade: SizedTrade | null;
  rejected: string[];
  /** the outcome the common factor resolves every market to */
  cfIndex: number;
  /** does the chosen position retain that outcome, i.e. is it hedged against the common factor? */
  hedged: boolean;
}

const rows: Row[] = [];
for (const m of spec.markets) {
  const parsed = parseMarketRef(m.ref);
  const chainId = parseChainId(m.chain ?? parsed.chainId);
  const api = await fetchSeerMarket(chainId, parsed.idOrSlug);
  if (!api) {
    console.error("  ! no market found for " + m.ref + " on chain " + chainId + " - skipped");
    continue;
  }
  const client = getPublicClient(chainId, args.rpc as string | undefined);
  const snap = await snapshot(client, chainId, api.id);
  if (m.own.length !== snap.outcomes.length) {
    console.error("  ! " + api.id + ": own has " + m.own.length + " values, market has " + snap.outcomes.length + " outcomes - skipped");
    continue;
  }
  const ownSum = m.own.reduce((a, x) => a + x, 0);
  if (Math.abs(ownSum - 1) > 0.02) {
    console.error("  ! " + api.id + ": own sums to " + ownSum.toFixed(3) + ", not 1 - skipped");
    continue;
  }

  // Apply the common factor once: with probability cfP the event fails and EVERY market resolves to the
  // same outcome. The agent's `own` is the view conditional on the event resolving normally, so rescale it
  // by (1 - cfP) and put the common factor mass on whichever outcome that scenario actually produces.
  const spec_rt = m.resolvesTo ?? cf?.resolvesTo ?? "invalid";
  const cfIndex = spec_rt === "invalid" ? snap.invalidIndex : Number(spec_rt);
  if (!(cfIndex >= 0 && cfIndex < snap.outcomes.length)) {
    console.error("  ! " + api.id + ": commonFactor.resolvesTo=" + String(spec_rt) + " is not an outcome of this market - skipped");
    continue;
  }
  const own = normalize(m.own);
  const withCf = own.map((p, i) => (i === cfIndex ? p * (1 - cfP) + cfP : p * (1 - cfP)));
  const blended = blend(normalize(withCf), snap.implied, m.weight ?? 0.25);

  let best: { trade: SizedTrade; rejected: string[] } | null = null;
  for (const pool of snap.pools) {
    if (!pool.exists) continue;
    if (blended[pool.index] - (snap.spot[pool.index] ?? 0) <= 0) continue;
    const rr = await ladder(client, snap, pool.index, blended, limits, DEFAULT_LADDER);
    const res = planTrade(rr, blended, pool.index, limits);
    if (res.trade && (!best || res.trade.ev > best.trade.ev)) best = { trade: res.trade, rejected: res.rejected };
  }

  rows.push({
    name: snap.name,
    url: marketUrl(api),
    ref: m.ref,
    chainId,
    address: api.id,
    outcomes: snap.outcomes,
    invalidIndex: snap.invalidIndex,
    blended,
    trade: best?.trade ?? null,
    rejected: best?.rejected ?? ["no outcome looked underpriced"],
    cfIndex,
    hedged: !!best?.trade && best.trade.retained.includes(cfIndex),
  });
}

// ---------------------------------------------------------------- total exposure

const live = rows.filter((r) => r.trade);
let total = live.reduce((a, r) => a + Number(formatUnits(r.trade!.collateralIn, 18)), 0);
const cap = bankroll * maxTotal;
const scale = total > cap ? cap / total : 1;
if (scale < 1) total = cap;

console.log("=".repeat(104));
for (const r of rows) {
  console.log("");
  console.log(r.name.slice(0, 100));
  console.log("  " + r.url);
  if (!r.trade) {
    console.log("  NO TRADE - " + r.rejected.slice(-2).join("; "));
    continue;
  }
  const t = r.trade;
  const stake = Number(formatUnits(t.collateralIn, 18)) * scale;
  const tokens = Number(formatUnits(t.tokensOut, 18)) * scale;
  console.log("  buy       " + r.outcomes[t.targetIndex].slice(0, 80));
  console.log("  route     " + t.kind + (t.kind === "split" ? "  (mint a complete set, sell the rest)" : "  (swap into the pool)"));
  console.log("  stake     " + stake.toFixed(2) + "  ->  " + tokens.toFixed(2) + " tokens at " + t.avgPrice.toFixed(4));
  console.log("  pays out  " + tokens.toFixed(2) + " if: " + t.retained.map((i) => r.outcomes[i]).join(" or "));
  console.log("  p(win)    " + (t.winProb * 100).toFixed(1) + "%   edge " + ((t.winProb - t.avgPrice) * 100).toFixed(1) + " pts   EV +" + (t.ev * scale).toFixed(2));
  console.log("  hedged    " + (r.hedged ? "yes - retains \"" + r.outcomes[r.cfIndex] + "\", which pays exactly when the common factor hits" : "NO - if the common factor hits, this stake is lost in full"));
  console.log("  run       npm run trade -- " + r.address + " --chain " + r.chainId + " --outcome " + t.targetIndex + " --route " + t.kind + " --size " + (t.kind === "split" ? tokens.toFixed(4) : stake.toFixed(4)) + " --dry-run");
}

console.log("");
console.log("=".repeat(104));
console.log("FLEET TOTALS");
console.log("  positions            " + live.length + " of " + rows.length + " markets");
console.log("  total at risk        " + total.toFixed(2) + "  (" + ((total / bankroll) * 100).toFixed(1) + "% of bankroll" + (scale < 1 ? ", scaled down by " + ((1 - scale) * 100).toFixed(0) + "% to respect the " + (maxTotal * 100).toFixed(0) + "% fleet cap" : "") + ")");
console.log("  total EV             +" + live.reduce((a, r) => a + r.trade!.ev * scale, 0).toFixed(2));

if (cf) {
  const hedged = live.filter((r) => r.hedged);
  const unhedged = live.filter((r) => !r.hedged);
  const hedgedStake = hedged.reduce((a, r) => a + Number(formatUnits(r.trade!.collateralIn, 18)) * scale, 0);
  const hedgedPayout = hedged.reduce((a, r) => a + Number(formatUnits(r.trade!.tokensOut, 18)) * scale, 0);
  const unhedgedStake = unhedged.reduce((a, r) => a + Number(formatUnits(r.trade!.collateralIn, 18)) * scale, 0);
  console.log("");
  console.log("  COMMON-FACTOR SCENARIO  \"" + cf.label + "\" (p = " + (cfP * 100).toFixed(1) + "%): every market resolves the same way at once");
  console.log("    positions that stay hedged   " + hedged.length + "  staked " + hedgedStake.toFixed(2) + "  ->  pays " + hedgedPayout.toFixed(2));
  console.log("    positions left exposed      " + unhedged.length + "  staked " + unhedgedStake.toFixed(2) + "  ->  pays 0");
  console.log("    net in that scenario        " + (hedgedPayout - hedgedStake - unhedgedStake >= 0 ? "+" : "") + (hedgedPayout - hedgedStake - unhedgedStake).toFixed(2));
  if (unhedged.length) console.log("    -> the " + unhedged.length + " unhedged position(s) are the real correlated risk; consider expressing them on the side the common factor resolves to");
}
console.log("");
console.log("Quotes are live and these pools are thin. Re-run immediately before executing, and dry-run every leg.");
