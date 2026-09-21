/**
 * `npm run portfolio -- [--account 0x..] [--filter zcash] [--chain 10] [--scope]`
 *
 * What the wallet is actually holding across Seer markets, marked to the price it could really exit at
 * (a quote for the whole position, not the spot price - on pools this thin those are different numbers).
 *
 * --scope limits the scan to the markets in this chain's scope list (PASS_MARKET_LIST_<chain>, or PASS_MARKET_LIST
 * on the folder's own chain) and their parent markets. Gnosis has a thousand markets; the bot's book is in a few.
 *
 * Complete sets (one of every outcome, Invalid included) are marked at 1 collateral each: that is what merging
 * them returns, whatever the pools say. A conditional market's collateral is an outcome token of its parent, so
 * its marks are in that token; the totals are kept per collateral and then quoted back into the chain's own
 * collateral, which is the figure to compare against cash. Valuation lives in src/book.ts.
 *
 * Read-only.
 */
import { formatUnits, type Address } from "viem";
import { parseArgs } from "./args.js";
import { inRootCollateral, symbolOf, valueBook } from "./book.js";
import { getAccount, getPublicClient } from "./clients.js";
import { EXPECTED_FACTORY_CONFIG, parseChainId } from "./config.js";
import { marketUrl, searchSeerMarkets, type SeerMarket } from "./seer-api.js";

const args = parseArgs(process.argv.slice(2));
const chainId = parseChainId(args.chain as string | undefined);
const client = getPublicClient(chainId, args.rpc as string | undefined);

let account: Address;
if (args.account) {
  account = args.account as Address;
} else {
  try {
    account = getAccount().address;
  } catch {
    console.error("Pass --account 0x... (or set PRIVATE_KEY for the bot wallet).");
    process.exit(2);
  }
}
const filter = args.filter ? new RegExp(String(args.filter), "i") : /./;

console.log("PORTFOLIO  " + account + "  on chain " + chainId);
console.log("");

let markets: SeerMarket[] = await searchSeerMarkets(filter, { chainId });
if (args.scope) {
  const home = Number(chainId) === Number(process.env.CHAIN_ID ?? 10);
  const raw = process.env["PASS_MARKET_LIST_" + chainId] ?? (home ? process.env.PASS_MARKET_LIST : undefined) ?? "";
  const list = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!list.size) {
    console.error("--scope: no scope list for chain " + chainId + " in .env (PASS_MARKET_LIST_" + chainId + (home ? " or PASS_MARKET_LIST" : "") + ").");
    process.exit(2);
  }
  const parents = new Set(markets.filter((m) => list.has(m.id.toLowerCase())).map((m) => (m.parentMarket?.id ?? "").toLowerCase()).filter((id) => id && !/^0x0{40}$/.test(id)));
  markets = markets.filter((m) => list.has(m.id.toLowerCase()) || parents.has(m.id.toLowerCase()));
  console.log("--scope: the " + list.size + " markets in scope" + (parents.size ? " and their " + parents.size + " parent market(s)" : ""));
}
console.log("scanning " + markets.length + " market(s) matching " + filter + " ...");
console.log("");

const book = await valueBook(client, chainId, account, markets);

for (const p of book.positions) {
  const m = p.market;
  console.log("  " + m.marketName.slice(0, 100));
  console.log("  " + marketUrl(m));
  if (m.parentMarket && !/^0x0{40}$/i.test(m.parentMarket.id)) console.log("  conditional: collateral " + p.collateralSymbol + " is an outcome token of parent " + m.parentMarket.id + "; marks below are in it");
  console.log("    " + "outcome".padEnd(48) + "      tokens".padStart(12) + "   exit value   note");
  for (const r of p.rows) console.log("    " + r.outcome.slice(0, 46).padEnd(48) + Number(formatUnits(r.tokens, 18)).toFixed(4).padStart(12) + "   " + r.exit.toFixed(4).padStart(10) + "   " + r.note);
  if (p.sets > 0n) console.log("    " + ("complete sets: " + Number(formatUnits(p.sets, 18)).toFixed(4) + ", merge 1:1 -> " + p.collateralSymbol).padEnd(60) + "   " + Number(formatUnits(p.sets, 18)).toFixed(4).padStart(10) + "   `npm run unwind -- " + m.id + " --chain " + chainId + " --merge-only`");
  console.log("    " + "".padEnd(48) + "".padStart(12) + "   " + p.mark.toFixed(4).padStart(10) + "   mark-to-exit for this market, in " + p.collateralSymbol);
  console.log("    resolved: " + (m.payoutReported ? "YES - run `npm run redeem -- " + m.id + " --chain " + chainId + "`" : "not yet"));
  console.log("");
}

if (!book.positions.length) {
  console.log("No outcome-token positions found in markets matching " + filter + ".");
} else {
  console.log("positions in " + book.positions.length + " market(s); total mark-to-exit " + [...book.perCollateral.values()].map((c) => c.total.toFixed(4) + " " + c.symbol).join(" + "));
  console.log("(mark-to-exit quotes selling the whole position at once; it is the honest number on pools this thin)");
  const root = (markets.find((m) => !m.parentMarket || /^0x0{40}$/i.test(m.parentMarket.id))?.collateralToken ?? EXPECTED_FACTORY_CONFIG[chainId]?.collateralToken) as Address | undefined;
  if (root && (book.perCollateral.size > 1 || !book.perCollateral.has(root.toLowerCase()))) {
    const rootSymbol = await symbolOf(client, root);
    const valued = await inRootCollateral(client, chainId, markets, root, book, account);
    console.log("");
    console.log("in " + rootSymbol + ", parent tokens quoted back through their parents' pools:");
    for (const part of valued.parts) console.log("  " + (part.amount.toFixed(4) + " " + part.symbol).padEnd(28) + "-> " + part.value.toFixed(4).padStart(10) + " " + rootSymbol + "   " + part.note);
    console.log("  " + "whole book".padEnd(28) + "-> " + valued.total.toFixed(4).padStart(10) + " " + rootSymbol);
  }
}
