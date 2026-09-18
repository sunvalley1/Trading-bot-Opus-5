/**
 * `npm run verify-dex -- [--chain 10]`
 *
 * Re-checks, against the live chain, every address `dex.ts` relies on. The ethskills rule is that an address
 * is only as good as the last time something read it back from the chain, and a wrong router address here
 * would send real collateral to a contract that is not the one we think it is.
 *
 * Checks:
 *   1. every configured address has code
 *   2. the routers expose exactly the function selectors we encode (SwapRouter02 has no deadline field;
 *      SwapRouter v1 does - getting this backwards silently mis-encodes every swap; Algebra's router on Gnosis
 *      has a deadline and no fee on exact-input), and the quoter belongs to the same factory
 *   3. the Seer Router exposes splitPosition / mergePositions / redeemPositions
 *   4. the Seer Router's conditionalTokens matches what the market factory was configured with
 *   5. the quoter actually answers for a real Seer pool
 */
import { toFunctionSelector, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { CHAIN_NAMES, parseChainId, SEER_ADDRESSES } from "./config.js";
import { erc20FullAbi, getDex, quoteExactIn, readOutcomePool } from "./dex.js";
import { searchSeerMarkets } from "./seer-api.js";

const args = parseArgs(process.argv.slice(2));
const chainId = parseChainId(args.chain as string | undefined);
const client = getPublicClient(chainId, args.rpc as string | undefined);
const dex = getDex(chainId);
const seer = SEER_ADDRESSES[chainId];

let failures = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  console.log("  [" + (pass ? "ok" : "FAIL") + "] " + label + (detail ? "  " + detail : ""));
  if (!pass) failures++;
};

console.log("VERIFY  " + CHAIN_NAMES[chainId] + " (" + chainId + ")  -  " + dex.name);
console.log("");

console.log("code present");
const addresses: Array<[string, Address]> = [
  ["AMM factory", dex.factory],
  ["AMM router", dex.router],
  ["AMM position manager", dex.nfpm],
  ["Seer Router", seer.Router],
  ["Seer MarketView", seer.MarketView],
  ["Seer MarketFactory", seer.MarketFactory],
];
if (dex.quoter) addresses.push(["AMM quoter", dex.quoter]);
for (const [label, address] of addresses) {
  const code = (await client.getCode({ address })) ?? "0x";
  ok(label.padEnd(22) + address, code.length > 2, code.length > 2 ? (code.length - 2) / 2 + " bytes" : "NO CODE AT THIS ADDRESS");
}

console.log("");
console.log("router interface");
if (dex.kind === "univ3") {
  const code = (await client.getCode({ address: dex.router })) ?? "0x";
  const noDeadline = toFunctionSelector("function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))").slice(2);
  const withDeadline = toFunctionSelector("function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(2);
  ok("exactInputSingle without deadline (what dex.ts encodes)", code.includes(noDeadline));
  ok("exactInputSingle with deadline is NOT this router", !code.includes(withDeadline));
  // unwind.ts buys back an exact number of tokens: the same no-deadline tuple shape, exact-output variant
  const exactOut = toFunctionSelector("function exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))").slice(2);
  ok("exactOutputSingle without deadline (what unwind.ts encodes)", code.includes(exactOut));
  if (dex.quoter) {
    const qcode = (await client.getCode({ address: dex.quoter })) ?? "0x";
    ok("quoter answers quoteExactInputSingle", qcode.includes(toFunctionSelector("function quoteExactInputSingle((address,address,uint256,uint24,uint160))").slice(2)));
    ok("quoter answers quoteExactOutputSingle (unwind.ts)", qcode.includes(toFunctionSelector("function quoteExactOutputSingle((address,address,uint256,uint24,uint160))").slice(2)));
  }
} else {
  // Algebra (Swapr v3 on Gnosis): what dex.ts's algebraRouterAbi / algebraQuoterAbi encode
  const code = (await client.getCode({ address: dex.router })) ?? "0x";
  ok("exactInputSingle with deadline, no fee (what dex.ts encodes)", code.includes(toFunctionSelector("function exactInputSingle((address,address,address,uint256,uint256,uint256,uint160))").slice(2)));
  ok("exactOutputSingle with fee and deadline (what unwind.ts encodes)", code.includes(toFunctionSelector("function exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(2)));
  ok("the Uniswap-shaped exactInputSingle is NOT this router", !code.includes(toFunctionSelector("function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))").slice(2)));
  if (dex.quoter) {
    const qcode = (await client.getCode({ address: dex.quoter })) ?? "0x";
    ok("quoter answers quoteExactInputSingle (flat arguments)", qcode.includes(toFunctionSelector("function quoteExactInputSingle(address,address,uint256,uint160)").slice(2)));
    ok("quoter answers quoteExactOutputSingle (flat arguments)", qcode.includes(toFunctionSelector("function quoteExactOutputSingle(address,address,uint256,uint160)").slice(2)));
    const factoryAbi = [{ type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
    const qf = await client.readContract({ address: dex.quoter, abi: factoryAbi, functionName: "factory" }).catch(() => undefined);
    ok("quoter.factory() is the AMM factory above", !!qf && qf.toLowerCase() === dex.factory.toLowerCase(), qf ?? "no answer");
  } else {
    ok("a quoter is configured", false, "none in dex.ts: quotes, plans and unwinds cannot run on this chain");
  }
}

console.log("");
console.log("Seer Router interface");
const seerCode = (await client.getCode({ address: seer.Router })) ?? "0x";
for (const sig of [
  "function splitPosition(address,address,uint256)",
  "function mergePositions(address,address,uint256)",
  "function redeemPositions(address,address,uint256[],uint256[])",
]) {
  ok(sig, seerCode.includes(toFunctionSelector(sig).slice(2)));
}
const ctAbi = [{ type: "function", name: "conditionalTokens", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const factoryCtAbi = [{ type: "function", name: "conditionalTokens", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
try {
  const routerCt = await client.readContract({ address: seer.Router, abi: ctAbi, functionName: "conditionalTokens" });
  const factoryCt = await client.readContract({ address: seer.MarketFactory, abi: factoryCtAbi, functionName: "conditionalTokens" });
  ok("Router and MarketFactory share one ConditionalTokens", routerCt.toLowerCase() === factoryCt.toLowerCase(), routerCt);
} catch (e) {
  ok("ConditionalTokens cross-check", false, (e as Error).message.split("\n")[0]);
}

console.log("");
console.log("live pool round-trip");
// This section proves the factory/quoter WORK, by exercising them against a pool that really has money in
// it. It is deliberately NOT a pass/fail on the addresses: whether any given market happens to be funded
// right now is a fact about the market, not about our configuration. Conflating the two produced a
// "do not trade this chain" verdict during development purely because one sampled market had been drained.
const sample = await searchSeerMarkets(/./, { chainId, maxPages: 6 });
let sampled = false;
for (const m of sample) {
  if (sampled) break;
  if (!m.wrappedTokens?.length) continue;
  const collateral = m.collateralToken;
  for (const [i, token] of m.wrappedTokens.entries()) {
    if (sampled) break;
    // readOutcomePool finds the pool the way trading does: getPool per fee tier on Uniswap, poolByPair on Algebra
    const pool = await readOutcomePool(client, chainId, i, m.outcomes[i] ?? "?", token, collateral).catch(() => undefined);
    if (!pool?.exists || pool.liquidity === 0n) continue;
    const bal = await client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [pool.pool] });
    ok("factory resolves a funded pool (" + m.marketName.slice(0, 34) + ")", true, (dex.kind === "univ3" ? "fee " + pool.fee + ", " : "") + "holds " + (Number(bal) / 1e18).toFixed(2) + " outcome tokens");
    const q = await quoteExactIn(client, chainId, collateral, token, 10n ** 18n, pool.fee);
    ok("quoter answers for that pool", q > 0n, q > 0n ? "1 collateral -> " + (Number(q) / 1e18).toFixed(4) + " tokens" : "returned 0");
    sampled = true;
  }
}
if (!sampled) {
  console.log("  [warn] no funded pool found in the sampled markets, so the factory/quoter round-trip was not exercised.");
  console.log("         This says nothing about the addresses above - it means the sampled markets are unfunded.");
  console.log("         Use `npm run scan -- \"<pattern>\"` to find one that is funded.");
}

console.log("");
console.log(failures === 0 ? "All checks passed." : failures + " check(s) FAILED - do not trade until this is resolved.");
process.exit(failures === 0 ? 0 : 1);
