/**
 * `npm run scan -- "zcash|NU7" [--chain 10] [--all]`
 *
 * Which markets matching a pattern can actually be traded right now.
 *
 * This exists because the obvious sources lie. app.seer.pm reports `liquidityUSD` from its indexer, which can
 * stay stale for hours after the money has left, and an outcome pool that has been drained keeps its last
 * sqrt price forever - so a dead market still shows a plausible-looking price and a four-figure liquidity
 * number. The only trustworthy signal is the pool's own `liquidity`, read from the pool. That is what this
 * scans for, and it is the first thing to run before spending research effort on a market.
 *
 * Read-only.
 */
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { readOutcomePool } from "./dex.js";
import { marketUrl, searchSeerMarkets } from "./seer-api.js";
import { readMarket } from "./market-view.js";

const args = parseArgs(process.argv.slice(2));
const pattern = args._.join(" ").trim();
if (!pattern) {
  console.error('usage: npm run scan -- "<regex over market names>" [--chain 10] [--all]');
  console.error('       e.g. npm run scan -- "zcash|NU7|ZEC" --chain 10');
  process.exit(2);
}
const chainId = parseChainId(args.chain as string | undefined);
const showAll = !!args.all;
const client = getPublicClient(chainId, args.rpc as string | undefined);

const markets = await searchSeerMarkets(new RegExp(pattern, "i"), { chainId });
console.log("SCAN  /" + pattern + "/i  on chain " + chainId + "  -  " + markets.length + " market(s) match");
console.log("");

const live: Array<{ name: string; url: string; id: string; depth: string; liq: number }> = [];
const dead: string[] = [];
/** Markets whose state could NOT be established. Never folded into `dead`: "the RPC failed" is not "no liquidity". */
const unknown: string[] = [];

for (const m of markets) {
  try {
    const info = await readMarket(client, chainId, m.id);
    let total = 0n;
    const cells: string[] = [];
    for (const [i, token] of info.wrappedTokens.entries()) {
      const p = await readOutcomePool(client, chainId, i, info.outcomes[i] ?? "?", token, info.collateralToken);
      total += p.liquidity;
      if (!p.exists) cells.push((info.outcomes[i] ?? "?").slice(0, 14) + " no pool");
      else if (p.liquidity === 0n) cells.push((info.outcomes[i] ?? "?").slice(0, 14) + " DRAINED");
      else cells.push((info.outcomes[i] ?? "?").slice(0, 14) + " " + (p.price ?? 0).toFixed(3) + " (" + Number(formatUnits(p.collateralBalance, 18)).toFixed(0) + " collat)");
    }
    if (total > 0n) live.push({ name: m.marketName, url: marketUrl(m), id: m.id, depth: cells.join(" | "), liq: m.liquidityUSD });
    else dead.push(m.marketName.slice(0, 88) + "   (app.seer.pm still advertises $" + m.liquidityUSD.toFixed(0) + ")");
  } catch (e) {
    unknown.push(m.marketName.slice(0, 78) + "   [" + (e as Error).message.split("\n")[0].slice(0, 60) + "]");
  }
}

console.log("TRADEABLE (" + live.length + ") - at least one outcome pool has live liquidity");
for (const l of live) {
  console.log("");
  console.log("  " + l.name.slice(0, 104));
  console.log("  " + l.url);
  console.log("  " + l.id + "   " + l.depth);
}
console.log("");
console.log("NOT TRADEABLE (" + dead.length + ") - every outcome pool drained, or no pool at all");
if (showAll) for (const d of dead) console.log("  " + d);
else console.log("  (pass --all to list them)");
if (unknown.length) {
  console.log("");
  console.log("COULD NOT READ (" + unknown.length + ") - the RPC failed on these, so they are UNKNOWN, not dead. Re-run before concluding anything.");
  for (const u of unknown) console.log("  " + u);
}
console.log("");
console.log("Only the TRADEABLE list is worth researching. A drained pool keeps its last price, so a dead market");
console.log("still shows a normal-looking quote - and the indexed liquidity figure can lag reality by hours.");
