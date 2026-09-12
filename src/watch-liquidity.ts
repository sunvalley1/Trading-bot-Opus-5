/**
 * npm run watch -- <market> [<market> ...] [--chain 10] [--interval 60] [--for 7200]
 *
 * Polls the outcome pools of one or more markets and exits the moment ANY of them has live liquidity
 * again. Written for the case this repository ran into for real: a market whose liquidity provider
 * withdrew everything, leaving a normal-looking price, a stale four-figure liquidity figure on
 * app.seer.pm, and nothing to trade against. If the provider comes back before the event closes, the
 * window to trade may be short.
 *
 * Exit codes: 0 = something became tradeable (details printed), 1 = the time budget ran out.
 * Read-only; it signs nothing and sends nothing.
 */
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { fetchSeerMarket, parseMarketRef } from "./seer-api.js";
import { snapshot } from "./trade.js";

const args = parseArgs(process.argv.slice(2));
const refs = args._;
if (!refs.length) {
  console.error("usage: npm run watch -- <market> [<market> ...] [--chain 10] [--interval 60] [--for 7200]");
  process.exit(2);
}
const intervalMs = Number(args.interval ?? 60) * 1000;
const budgetMs = Number(args["for"] ?? 7200) * 1000;
const started = Date.now();

const targets: Array<{ ref: string; chainId: ReturnType<typeof parseChainId>; address: string; name: string }> = [];
for (const ref of refs) {
  const parsed = parseMarketRef(ref);
  const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);
  const api = await fetchSeerMarket(chainId, parsed.idOrSlug);
  if (!api) {
    console.error("  ! no market found for " + ref + " on chain " + chainId);
    continue;
  }
  targets.push({ ref, chainId, address: api.id, name: api.marketName });
}
if (!targets.length) process.exit(2);

console.log("WATCHING " + targets.length + " market(s) for liquidity, every " + intervalMs / 1000 + "s, for up to " + (budgetMs / 60000).toFixed(0) + " minutes");
for (const t of targets) console.log("  " + t.address + "  " + t.name.slice(0, 84));
console.log("");

let cycle = 0;
while (Date.now() - started < budgetMs) {
  cycle++;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const live: string[] = [];
  const summary: string[] = [];
  for (const t of targets) {
    try {
      const client = getPublicClient(t.chainId, args.rpc as string | undefined);
      const snap = await snapshot(client, t.chainId, t.address as `0x${string}`);
      if (snap.tradeable) {
        const detail = snap.pools
          .filter((p) => p.liquidity > 0n)
          .map((p) => snap.outcomes[p.index] + " " + (p.price ?? 0).toFixed(4) + " (" + Number(formatUnits(p.collateralBalance, 18)).toFixed(2) + " collat)")
          .join(" | ");
        live.push(t.address + "  " + t.name.slice(0, 60) + "\n      " + detail);
        summary.push("LIVE");
      } else {
        summary.push("dead");
      }
    } catch (e) {
      summary.push("err"); // a transport failure is not evidence of anything; just try again next cycle
    }
  }
  console.log(stamp + "  cycle " + cycle + "  [" + summary.join(" ") + "]");
  if (live.length) {
    console.log("");
    console.log("*** LIQUIDITY IS BACK ***");
    for (const l of live) console.log("  " + l);
    console.log("");
    console.log("Re-run the plan immediately - these pools are thin and this may not last:");
    for (const t of targets) console.log("  npm run plan -- " + t.address + " --chain " + t.chainId + " --own <p,..> --weight <w> --bankroll <X>");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}
console.log("");
console.log("Time budget exhausted after " + cycle + " cycles. Nothing became tradeable. Re-run to keep watching.");
process.exit(1);
