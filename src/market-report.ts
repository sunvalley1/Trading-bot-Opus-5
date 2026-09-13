/**
 * `npm run market -- <address | slug | app.seer.pm URL> [--chain 10] [--sizes 1,5,25]`
 *
 * Step 0 of the trading methodology: look at what is actually there before forming any opinion.
 * Prints the question, the on-chain pool prices, how deep each pool really is (what a given size would
 * actually fill at, both routes), the resolution timetable, and any complete-set arbitrage.
 *
 * Read-only. Sends nothing, signs nothing.
 */
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { completeSetArb, DEFAULT_LIMITS, describeActivity, describeSnapshot, ladder, marketActivity, snapshot } from "./trade.js";
import { iso } from "./market-view.js";

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
if (!ref) {
  console.error('usage: npm run market -- <address | slug | app.seer.pm URL> [--chain 10] [--sizes 1,5,25,100]');
  process.exit(2);
}
const parsed = parseMarketRef(ref);
const chainId = parseChainId(args.chain as string | undefined ?? parsed.chainId);
const sizes = String(args.sizes ?? "1,5,10,25,50,100").split(",").map(Number).filter((n) => n > 0);

const api = await fetchSeerMarket(chainId, parsed.idOrSlug);
if (!api) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ". Pass the address, the slug, or the full app.seer.pm URL.");
  process.exit(1);
}

const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, api.id);

console.log(describeSnapshot(snap));
console.log("");
console.log("app.seer.pm      " + marketUrl(api));
console.log("indexed odds     " + api.odds.map((o) => (o === null ? "-" : o.toFixed(1) + "%")).join(" | "));
console.log("liquidity        $" + api.liquidityUSD.toFixed(2) + " (indexed; can lag the pools by hours)");
console.log("sets minted      " + Number(formatUnits(BigInt(api.outcomesSupply || "0"), 18)).toFixed(2) + "  (what app.seer.pm calls open interest, $" + api.openInterestUSD.toFixed(2) + ": counts the creator's seed and every split, but no direct swap - not a measure of trading)");

// ---- what has actually traded: the pools' own Swap events since the market was created. This, not open
// interest, says whether the price is anybody's opinion but the creator's.
{
  let fromBlock: bigint | undefined;
  if (api.transactionHash) {
    const rcpt = await client.getTransactionReceipt({ hash: api.transactionHash as `0x${string}` }).catch(() => undefined);
    fromBlock = rcpt?.blockNumber;
  }
  if (fromBlock === undefined && api.blockTimestamp) {
    // no receipt: estimate the creation block from the timestamp, generously (a wider window only costs time)
    const head = await client.getBlock();
    const secondsPerBlock = chainId === 10 ? 2 : 5;
    const back = BigInt(Math.ceil((Number(head.timestamp) - api.blockTimestamp) / secondsPerBlock)) + 5_000n;
    fromBlock = head.number > back ? head.number - back : 0n;
  }
  if (fromBlock === undefined) {
    console.log("TRADED           unknown (the API gave no creation block to scan from)");
  } else {
    try {
      const act = await marketActivity(client, snap, fromBlock);
      console.log(describeActivity(snap, act));
    } catch (e) {
      console.log("TRADED           could not read the pools' Swap events: " + ((e as Error).message ?? String(e)).split("\n")[0]);
    }
  }
}
console.log("category         " + (api.categories ?? []).join(", ") + "    verification: " + (api.verification?.status ?? "?"));
console.log("opening time     " + iso(api.openingTs) + (api.openingTs * 1000 < Date.now() ? "  (open: the oracle can be answered now)" : "  (not open yet)"));
console.log("answers so far   " + (api.hasAnswers ? "yes" : "none") + "     payout reported: " + (api.payoutReported ? "YES - market is resolved" : "no"));
for (const q of api.questions ?? []) {
  console.log("  reality q      " + q.id + "  min bond " + formatUnits(BigInt(q.min_bond || "0"), 18) + "  current bond " + formatUnits(BigInt(q.bond || "0"), 18) + "  timeout " + (q.timeout / 3600).toFixed(1) + "h" + (q.is_pending_arbitration ? "  [IN ARBITRATION]" : ""));
}
console.log("");
console.log("question as the oracle sees it:");
for (const e of api.encodedQuestions ?? []) console.log("  " + e);

// ---- depth per outcome, priced against a flat prior so the table is purely about fills, not opinions
const flat = snap.outcomes.map(() => 1 / snap.outcomes.length);
const limits = { ...DEFAULT_LIMITS, bankroll: 1000 };
for (const p of snap.pools) {
  if (!p.exists) continue;
  console.log("");
  const rungs = await ladder(client, snap, p.index, flat, limits, sizes);
  const head = "DEPTH  buying \"" + snap.outcomes[p.index] + "\"  (spot " + (p.price ?? 0).toFixed(4) + ")";
  console.log(head);
  console.log("size   route   net cost   tokens      avg fill   slippage vs spot   also wins if");
  for (const r of rungs) {
    const t = r.best;
    if (!t) {
      console.log(String(r.size).padStart(4) + "   -       no fill at this size");
      continue;
    }
    const extra = t.retained.filter((i) => i !== p.index).map((i) => snap.outcomes[i]);
    console.log(
      String(r.size).padStart(4) +
        "   " + t.kind.padEnd(6) +
        "  " + Number(formatUnits(t.collateralIn, 18)).toFixed(2).padStart(8) +
        "  " + Number(formatUnits(t.tokensOut, 18)).toFixed(2).padStart(9) +
        "   " + t.avgPrice.toFixed(4) +
        "   " + (t.slippage * 100).toFixed(1).padStart(7) + "%" +
        "          " + (extra.length ? extra.join(" / ") : "-"),
    );
  }
}

// ---- the trade that needs no forecast at all
console.log("");
const arb = await completeSetArb(client, snap, 10);
console.log("COMPLETE-SET CHECK (10 " + snap.collateralSymbol + " notional)");
console.log("  split 10 and sell every leg : " + (arb.sellAll === null ? "n/a" : (arb.sellAll >= 0 ? "+" : "") + arb.sellAll.toFixed(3) + " " + snap.collateralSymbol));
console.log("  buy every leg and merge     : " + (arb.buyAll === null ? "n/a (an outcome has no pool, the set cannot be bought)" : (arb.buyAll >= 0 ? "+" : "") + arb.buyAll.toFixed(3) + " " + snap.collateralSymbol));
if (arb.note) console.log("  " + arb.note);
console.log("");
console.log("Next: form your own estimate, then `npm run plan -- " + api.id + " --own <p1,p2,...> --weight <0..1> --bankroll <X>`");
