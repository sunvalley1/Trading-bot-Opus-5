/**
 * `npm run portfolio -- [--account 0x..] [--filter zcash] [--chain 10]`
 *
 * What the wallet is actually holding across Seer markets, marked to the price it could really exit at
 * (a quote for the whole position, not the spot price - on pools this thin those are different numbers).
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

const markets: SeerMarket[] = await searchSeerMarkets(filter, { chainId });
console.log("scanning " + markets.length + " market(s) matching " + filter + " ...");
console.log("");

let totalMark = 0;
let held = 0;
for (const m of markets) {
  const rows: string[] = [];
  let marketMark = 0;
  for (const [i, token] of (m.wrappedTokens ?? []).entries()) {
    const bal = await client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] }).catch(() => 0n);
    if (bal === 0n) continue;
    const pool = await readOutcomePool(client, chainId, i, m.outcomes[i] ?? "?", token, m.collateralToken);
    let exit = 0;
    let exitNote = "no pool - only redeemable if this outcome wins";
    if (pool.exists) {
      const got = await quoteExactIn(client, chainId, token, m.collateralToken, bal, pool.fee);
      exit = Number(formatUnits(got, 18));
      exitNote = got > 0n ? "exit @ " + (exit / Number(formatUnits(bal, 18))).toFixed(4) + " (spot " + (pool.price ?? 0).toFixed(4) + ")" : "pool cannot absorb this size";
    }
    marketMark += exit;
    rows.push("    " + (m.outcomes[i] ?? "?").slice(0, 46).padEnd(48) + Number(formatUnits(bal, 18)).toFixed(4).padStart(12) + "   " + exit.toFixed(4).padStart(10) + "   " + exitNote);
  }
  if (!rows.length) continue;
  held++;
  totalMark += marketMark;
  console.log("  " + m.marketName.slice(0, 100));
  console.log("  " + marketUrl(m));
  console.log("    " + "outcome".padEnd(48) + "      tokens".padStart(12) + "   exit value   note");
  for (const r of rows) console.log(r);
  console.log("    " + "".padEnd(48) + "".padStart(12) + "   " + marketMark.toFixed(4).padStart(10) + "   mark-to-exit for this market");
  console.log("    resolved: " + (m.payoutReported ? "YES - run `npm run redeem -- " + m.id + " --chain " + chainId + "`" : "not yet"));
  console.log("");
}

if (!held) {
  console.log("No outcome-token positions found in markets matching " + filter + ".");
} else {
  console.log("positions in " + held + " market(s); total mark-to-exit " + totalMark.toFixed(4));
  console.log("(mark-to-exit quotes selling the whole position at once; it is the honest number on pools this thin)");
}
