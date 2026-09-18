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
 * its marks are in that token, and totals are kept per collateral rather than added across them.
 *
 * Read-only.
 */
import { formatUnits, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getAccount, getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { erc20FullAbi, quoteExactIn, readOutcomePool } from "./dex.js";
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

const symbols = new Map<string, string>();
const symbolOf = async (token: Address) => {
  const k = token.toLowerCase();
  if (!symbols.has(k)) symbols.set(k, await client.readContract({ address: token, abi: erc20FullAbi, functionName: "symbol" }).catch(() => "?"));
  return symbols.get(k)!;
};

const totals = new Map<string, number>();
let held = 0;
for (const m of markets) {
  const tokens = m.wrappedTokens ?? [];
  const bals: bigint[] = [];
  for (const token of tokens) bals.push(await client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] }).catch(() => 0n));
  if (bals.every((b) => b === 0n)) continue;
  // complete sets merge into exactly 1 collateral each, so they are marked at that and only the rest is quoted
  const sets = bals.length && bals.every((b) => b > 0n) ? bals.reduce((a, b) => (b < a ? b : a)) : 0n;
  const collateralSymbol = await symbolOf(m.collateralToken);
  const rows: string[] = [];
  let marketMark = Number(formatUnits(sets, 18));
  for (const [i, token] of tokens.entries()) {
    const bal = bals[i];
    if (bal === 0n) continue;
    const rest = bal - sets;
    let exit = 0;
    let exitNote = rest === 0n ? "all in complete sets" : "no pool - only redeemable if this outcome wins";
    if (rest > 0n) {
      const pool = await readOutcomePool(client, chainId, i, m.outcomes[i] ?? "?", token, m.collateralToken);
      if (pool.exists) {
        const got = await quoteExactIn(client, chainId, token, m.collateralToken, rest, pool.fee);
        exit = Number(formatUnits(got, 18));
        exitNote = got > 0n ? "exit @ " + (exit / Number(formatUnits(rest, 18))).toFixed(4) + " (spot " + (pool.price ?? 0).toFixed(4) + ")" : "pool cannot absorb this size";
      }
      if (sets > 0n) exitNote = "beyond the sets: " + exitNote;
    }
    marketMark += exit;
    rows.push("    " + (m.outcomes[i] ?? "?").slice(0, 46).padEnd(48) + Number(formatUnits(bal, 18)).toFixed(4).padStart(12) + "   " + exit.toFixed(4).padStart(10) + "   " + exitNote);
  }
  held++;
  totals.set(collateralSymbol, (totals.get(collateralSymbol) ?? 0) + marketMark);
  console.log("  " + m.marketName.slice(0, 100));
  console.log("  " + marketUrl(m));
  if (m.parentMarket && !/^0x0{40}$/i.test(m.parentMarket.id)) console.log("  conditional: collateral " + collateralSymbol + " is an outcome token of parent " + m.parentMarket.id + "; marks below are in it");
  console.log("    " + "outcome".padEnd(48) + "      tokens".padStart(12) + "   exit value   note");
  for (const r of rows) console.log(r);
  if (sets > 0n) console.log("    " + ("complete sets: " + Number(formatUnits(sets, 18)).toFixed(4) + ", merge 1:1 -> " + collateralSymbol).padEnd(60) + "   " + Number(formatUnits(sets, 18)).toFixed(4).padStart(10) + "   `npm run unwind -- " + m.id + " --chain " + chainId + " --merge-only`");
  console.log("    " + "".padEnd(48) + "".padStart(12) + "   " + marketMark.toFixed(4).padStart(10) + "   mark-to-exit for this market, in " + collateralSymbol);
  console.log("    resolved: " + (m.payoutReported ? "YES - run `npm run redeem -- " + m.id + " --chain " + chainId + "`" : "not yet"));
  console.log("");
}

if (!held) {
  console.log("No outcome-token positions found in markets matching " + filter + ".");
} else {
  console.log("positions in " + held + " market(s); total mark-to-exit " + [...totals.entries()].map(([sym, v]) => v.toFixed(4) + " " + sym).join(" + "));
  console.log("(mark-to-exit quotes selling the whole position at once; it is the honest number on pools this thin)");
}
