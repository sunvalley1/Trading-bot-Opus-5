/**
 * `npm run plan -- <market> --own 0.72,0.25,0.03 --weight 0.4 --bankroll 500 [--kelly 0.25] [--min-edge 0.05]`
 *
 * Steps 2-4 of the methodology, once the research is done:
 *   --own      your researched probabilities, in outcome order, Invalid last. They must sum to ~1.
 *   --weight   how much of your own view survives the reconciliation with the market (see `blend()`).
 *   --bankroll the capital the sizing is allowed to reason about, in collateral units.
 *
 * Prints the reconciliation, the depth curve for every outcome that looks mispriced, and the one trade per
 * outcome that clears every limit. Sends nothing: it ends with the exact `npm run trade` command to run.
 *
 * Scalar markets (DOWN/UP/Invalid): give UP your EXPECTED payout fraction, E[clamp((answer - lower)/(upper -
 * lower), 0, 1)], DOWN the rest less Invalid. Expected value is then exact, because a token's payout is linear
 * in that fraction, and Kelly sizing treats the payout as all-or-nothing, which overstates its risk: conservative.
 * Conditional markets: sizes and the bankroll are in the parent outcome token, minted 1:1 from sDAI.
 */
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { blend, DEFAULT_LADDER, DEFAULT_LIMITS, describeSnapshot, fadeLadder, ladder, normalize, planTrade, snapshot, type SizedTrade, type SizingLimits } from "./trade.js";

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
const ownArg = args.own as string | undefined;
if (!ref || !ownArg) {
  console.error("usage: npm run plan -- <market> --own p1,p2,...  --weight 0..1 --bankroll <X> [--kelly 0.25] [--min-edge 0.05] [--max-slippage 0.15] [--max-per-market 0.2] [--sizes 1,5,25]");
  console.error("       --own takes one probability per outcome in the market's own order, Invalid last, summing to 1.");
  process.exit(2);
}
const parsed = parseMarketRef(ref);
const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);

const api = await fetchSeerMarket(chainId, parsed.idOrSlug);
if (!api) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ".");
  process.exit(1);
}

const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, api.id);

const own = ownArg.split(",").map((s) => Number(s.trim()));
if (own.length !== snap.outcomes.length) {
  console.error("--own has " + own.length + " values but the market has " + snap.outcomes.length + " outcomes:");
  snap.outcomes.forEach((o, i) => console.error("  [" + i + "] " + o));
  process.exit(2);
}
if (own.some((x) => !(x >= 0))) {
  console.error("--own must be non-negative numbers.");
  process.exit(2);
}
const ownSum = own.reduce((a, x) => a + x, 0);
if (Math.abs(ownSum - 1) > 0.02) {
  console.error("--own sums to " + ownSum.toFixed(4) + ", which is not 1. Fix the estimate rather than letting it be rescaled silently.");
  process.exit(2);
}
const ownN = normalize(own);

const weight = Number(args.weight ?? 0.25);
if (!(weight >= 0 && weight <= 1)) {
  console.error("--weight must be between 0 and 1.");
  process.exit(2);
}
const limits: SizingLimits = {
  bankroll: Number(args.bankroll ?? 0),
  kellyFraction: Number(args.kelly ?? DEFAULT_LIMITS.kellyFraction),
  maxPerMarket: Number(args["max-per-market"] ?? DEFAULT_LIMITS.maxPerMarket),
  maxSlippage: Number(args["max-slippage"] ?? DEFAULT_LIMITS.maxSlippage),
  minEdge: Number(args["min-edge"] ?? DEFAULT_LIMITS.minEdge),
};
if (!(limits.bankroll > 0)) {
  console.error("--bankroll must be a positive number of " + snap.collateralSymbol + ". Sizing is meaningless without it.");
  process.exit(2);
}
const sizes = args.sizes ? String(args.sizes).split(",").map(Number).filter((n) => n > 0) : DEFAULT_LADDER;

const blended = blend(ownN, snap.implied, weight);

console.log(describeSnapshot(snap));
console.log("");
console.log("app.seer.pm  " + marketUrl(api));
if (!snap.tradeable) {
  console.log("");
  console.log("PLAN: no trade. This market has no live liquidity in any outcome pool, so there is nothing to trade");
  console.log("      against at any price. Re-check later, or trade a market that is actually funded.");
  process.exit(0);
}
console.log("");
console.log("RECONCILIATION   own view kept at weight " + weight + " against the market's " + (1 - weight).toFixed(2));
const w = Math.max(10, ...snap.outcomes.map((o) => Math.min(o.length, 52)));
console.log("#  " + "outcome".padEnd(w) + "    own   market  blended    edge vs spot");
snap.outcomes.forEach((o, i) => {
  const label = (o.length > 52 ? o.slice(0, 49) + "..." : o).padEnd(w);
  const edge = blended[i] - (snap.spot[i] ?? 0);
  console.log(
    i + "  " + label +
      "  " + (ownN[i] * 100).toFixed(1).padStart(5) + "%" +
      "  " + (snap.implied[i] * 100).toFixed(1).padStart(5) + "%" +
      "  " + (blended[i] * 100).toFixed(1).padStart(5) + "%" +
      "   " + (edge >= 0 ? "+" : "") + (edge * 100).toFixed(1).padStart(5) + " pts" +
      (snap.spot[i] === undefined ? "   (no pool)" : ""),
  );
});
console.log("");
console.log("LIMITS  bankroll " + limits.bankroll + " " + snap.collateralSymbol + " | " + limits.kellyFraction + " Kelly | max " + (limits.maxPerMarket * 100).toFixed(0) + "% of bankroll here | max " + (limits.maxSlippage * 100).toFixed(0) + "% slippage | min edge " + (limits.minEdge * 100).toFixed(0) + " pts");

const chosen: Array<{ index: number; trade: SizedTrade }> = [];
for (const p of snap.pools) {
  const edge = blended[p.index] - (snap.spot[p.index] ?? 0);
  if (!p.exists) continue;
  if (edge <= 0) continue; // we only take the long side of an outcome; shorting it is buying the others
  console.log("");
  const rungs = await ladder(client, snap, p.index, blended, limits, sizes);
  console.log("DEPTH  buying \"" + snap.outcomes[p.index] + "\"   blended " + (blended[p.index] * 100).toFixed(1) + "%  vs spot " + ((snap.spot[p.index] ?? 0) * 100).toFixed(1) + "%");
  console.log("size   route   net cost   tokens      avg fill  slippage   p(win)   edge     EV      EV%");
  for (const r of rungs) {
    const t = r.best;
    if (!t) {
      console.log(String(r.size).padStart(4) + "   -       no fill");
      continue;
    }
    console.log(
      String(r.size).padStart(4) +
        "   " + t.kind.padEnd(6) +
        "  " + Number(formatUnits(t.collateralIn, 18)).toFixed(2).padStart(8) +
        "  " + Number(formatUnits(t.tokensOut, 18)).toFixed(2).padStart(9) +
        "   " + t.avgPrice.toFixed(4) +
        "  " + (t.slippage * 100).toFixed(1).padStart(6) + "%" +
        "  " + (t.winProb * 100).toFixed(1).padStart(5) + "%" +
        "  " + ((t.winProb - t.avgPrice) * 100).toFixed(1).padStart(5) + " pts" +
        "  " + t.ev.toFixed(2).padStart(6) +
        "  " + (t.evPct * 100).toFixed(1).padStart(6) + "%",
    );
  }
  const { trade, rejected } = planTrade(rungs, blended, p.index, limits);
  if (trade) {
    chosen.push({ index: p.index, trade });
    console.log("  -> take " + Number(formatUnits(trade.collateralIn, 18)).toFixed(2) + " " + snap.collateralSymbol + " via " + trade.kind + ", limited by " + trade.limitedBy);
  } else {
    console.log("  -> no size clears the limits. " + rejected.slice(-3).join("; "));
  }
}

// ---- the short side: an outcome priced ABOVE our estimate can be sold, by minting a complete set and
// selling only that leg. On a multi-outcome market this is often the only route with real edge.
for (const p of snap.pools) {
  const over = (snap.spot[p.index] ?? 0) - blended[p.index];
  if (!p.exists || over < limits.minEdge / 2) continue;
  console.log("");
  const rungs = await fadeLadder(client, snap, p.index, blended, limits, sizes);
  console.log("SHORT  selling \"" + snap.outcomes[p.index] + "\"   blended " + (blended[p.index] * 100).toFixed(1) + "%  vs spot " + ((snap.spot[p.index] ?? 0) * 100).toFixed(1) + "%   (keeps every other outcome)");
  console.log("size   net cost   tokens      avg fill   p(win)   edge     EV      EV%");
  for (const r of rungs) {
    const t = r.best;
    if (!t) { console.log(String(r.size).padStart(4) + "   no fill"); continue; }
    console.log(
      String(r.size).padStart(4) +
        "  " + Number(formatUnits(t.collateralIn, 18)).toFixed(2).padStart(9) +
        "  " + Number(formatUnits(t.tokensOut, 18)).toFixed(2).padStart(9) +
        "   " + t.avgPrice.toFixed(4) +
        "  " + (t.winProb * 100).toFixed(1).padStart(6) + "%" +
        "  " + ((t.winProb - t.avgPrice) * 100).toFixed(1).padStart(5) + " pts" +
        "  " + t.ev.toFixed(2).padStart(6) +
        "  " + (t.evPct * 100).toFixed(1).padStart(6) + "%",
    );
  }
  const { trade, rejected } = planTrade(rungs, blended, p.index, limits);
  if (trade) { chosen.push({ index: p.index, trade }); console.log("  -> SHORT " + Number(formatUnits(trade.collateralIn, 18)).toFixed(2) + " " + snap.collateralSymbol + ", limited by " + trade.limitedBy); }
  else console.log("  -> no size clears the limits. " + rejected.slice(-2).join("; "));
}

console.log("");
console.log("=".repeat(100));
if (!chosen.length) {
  console.log("PLAN: no trade. Nothing on this market clears the edge, slippage and exposure limits at this bankroll.");
  process.exit(0);
}
let total = 0;
console.log("PLAN for " + snap.name);
for (const { index, trade } of chosen) {
  const stake = Number(formatUnits(trade.collateralIn, 18));
  total += stake;
  const winsIf = trade.retained.map((i) => snap.outcomes[i]).join(" or ");
  console.log("");
  console.log((trade.kind === "fade" ? "  SELL SHORT \"" : "  buy \"") + snap.outcomes[index] + "\"");
  console.log("    route      " + trade.kind + (trade.kind === "split" ? " (mint a complete set, sell the outcomes we do not want)" : " (swap collateral straight into the pool)"));
  console.log("    stake      " + stake.toFixed(2) + " " + snap.collateralSymbol + "  ->  " + Number(formatUnits(trade.tokensOut, 18)).toFixed(2) + " tokens at " + trade.avgPrice.toFixed(4) + " each");
  if (snap.scalar) console.log("    pays out   " + Number(formatUnits(trade.tokensOut, 18)).toFixed(2) + " tokens of " + winsIf + ", each worth its share of the range at resolution (not all-or-nothing)");
  else console.log("    pays out   " + Number(formatUnits(trade.tokensOut, 18)).toFixed(2) + " " + snap.collateralSymbol + " if: " + winsIf);
  if (snap.parent) console.log("    condition  only if \"" + snap.parent.outcome + "\" wins the parent; otherwise the " + snap.collateralSymbol + " is worthless and the other parent tokens repay the split");
  console.log("    " + (snap.scalar ? "E[payout]  " : "p(win)     ") + (trade.winProb * 100).toFixed(1) + "%   edge " + ((trade.winProb - trade.avgPrice) * 100).toFixed(1) + " pts   EV +" + trade.ev.toFixed(2) + " (" + (trade.evPct * 100).toFixed(1) + "%)");
  console.log("    full Kelly " + (trade.kelly * 100).toFixed(1) + "% of bankroll; at " + limits.kellyFraction + " Kelly and the caps -> " + stake.toFixed(2));
  if (trade.failed.length) for (const f of trade.failed) console.log("    note       " + f);
  console.log("    run        npm run trade -- " + api.id + " --chain " + chainId + " --outcome " + index + " --route " + trade.kind + " --size " + (trade.kind === "split" ? Number(formatUnits(trade.tokensOut, 18)).toFixed(4) : stake.toFixed(4)) + " --dry-run");
}
console.log("");
console.log("  total at risk on this market: " + total.toFixed(2) + " " + snap.collateralSymbol + " (" + ((total / limits.bankroll) * 100).toFixed(1) + "% of bankroll)");
console.log("");
console.log("Quotes are live and these pools are thin: re-run this immediately before trading, and never skip --dry-run.");
