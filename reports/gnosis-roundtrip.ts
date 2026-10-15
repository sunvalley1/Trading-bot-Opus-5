/**
 * Read-only proof that the Seer Router takes the ROOT collateral (sDAI) as its argument for a conditional market,
 * for split and for merge alike: simulates, in one eth_simulateV1 sequence and without sending anything,
 *   sDAI -> parent complete sets -> child complete sets -> merge the child back -> merge the parent back -> sDAI
 * and checks the wallet ends where it started.
 *   npx tsx reports/gnosis-roundtrip.ts [child market] [wallet]
 */
import { formatUnits, parseUnits, type Address } from "viem";
import { getPublicClient } from "../src/clients.js";
import { erc20FullAbi, seerRouterAbi } from "../src/dex.js";
import { simulateSequence, type PlannedCall } from "../src/simulate.js";
import { seerRouter, snapshot } from "../src/trade.js";

const child = (process.argv[2] ?? "0x97fd5612ec07a6966f9fcaaaab2d5adc1c7bc1c4") as Address;
const wallet = (process.argv[3] ?? "0xf1b285F65A3174c9D6E062F089c5CD1Ea8cF30D9") as Address;
const client = getPublicClient(100);
const router = seerRouter(100);
const s = await snapshot(client, 100, child);
if (!s.parent) throw new Error("not a conditional market");
const p = await snapshot(client, 100, s.parent.market);
const amt = parseUnits("5", 18);
const approve = (token: Address, label: string): PlannedCall => ({ label: "approve " + label, address: token, abi: erc20FullAbi, functionName: "approve", args: [router, amt] });
const bal = (token: Address, label: string): PlannedCall => ({ label: "balance " + label, address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [wallet] });
const calls: PlannedCall[] = [
  bal(s.rootCollateral, s.rootCollateralSymbol + " before"),
  approve(s.rootCollateral, s.rootCollateralSymbol),
  { label: "split 5 " + s.rootCollateralSymbol + " into the parent's sets", address: router, abi: seerRouterAbi, functionName: "splitPosition", args: [s.rootCollateral, s.parent.market, amt] },
  approve(s.collateral, s.collateralSymbol),
  { label: "split 5 " + s.collateralSymbol + " into the child's sets (Router arg: " + s.rootCollateralSymbol + ")", address: router, abi: seerRouterAbi, functionName: "splitPosition", args: [s.rootCollateral, s.market, amt] },
  ...s.pools.map((o) => bal(o.token, "child " + o.symbol)),
  ...s.pools.map((o) => approve(o.token, "child " + o.symbol)),
  { label: "merge 5 child sets back into " + s.collateralSymbol, address: router, abi: seerRouterAbi, functionName: "mergePositions", args: [s.rootCollateral, s.market, amt] },
  bal(s.collateral, s.collateralSymbol + " after the child merge"),
  ...p.pools.map((o) => approve(o.token, "parent " + o.symbol)),
  { label: "merge 5 parent sets back into " + s.rootCollateralSymbol, address: router, abi: seerRouterAbi, functionName: "mergePositions", args: [s.rootCollateral, s.parent.market, amt] },
  bal(s.rootCollateral, s.rootCollateralSymbol + " after"),
];
const r = await simulateSequence(client, wallet, calls);
if (!r.supported) throw new Error("eth_simulateV1 unavailable: " + r.unsupportedReason);
r.results.forEach((x, i) => {
  const v = calls[i].functionName === "balanceOf" && x.ok ? "   = " + formatUnits(x.result as bigint, 18) : "";
  console.log((x.ok ? "ok       " : "REVERTS  ") + x.label + v + (x.error ? "   <- " + x.error : ""));
});
console.log(r.firstFailure < 0 ? "\nround trip succeeds: split and merge both take the root collateral for a conditional market" : "\nFAILED at " + r.results[r.firstFailure].label);

// ---- the two swap shapes on Swapr's Algebra router: buy an exact amount (unwind's buy-back) and sell exactly
const { exactInCall, exactOutCall, getDex } = await import("../src/dex.js");
const dex = getDex(100);
const up = s.pools.find((o) => /^up$/i.test(o.outcome))!;
const two = parseUnits("2", 18);
const withMe = (a: readonly unknown[]) => a.map((x) => (typeof x === "object" && x !== null && "recipient" in x ? { ...(x as object), recipient: wallet } : x));
const buy = exactOutCall(100, { tokenIn: s.collateral, tokenOut: up.token, fee: up.fee, amountOut: two, maxIn: parseUnits("3", 18) });
const sell = exactInCall(100, { tokenIn: up.token, tokenOut: s.collateral, fee: up.fee, amountIn: two, minOut: 0n });
const swaps: PlannedCall[] = [
  approve(s.rootCollateral, s.rootCollateralSymbol),
  { label: "split 5 " + s.rootCollateralSymbol + " into the parent's sets", address: router, abi: seerRouterAbi, functionName: "splitPosition", args: [s.rootCollateral, s.parent.market, amt] },
  { label: "approve " + s.collateralSymbol + " -> Swapr router", address: s.collateral, abi: erc20FullAbi, functionName: "approve", args: [dex.router, amt] },
  { label: "exactOutputSingle: buy exactly 2 " + up.symbol, address: dex.router, abi: buy.abi, functionName: buy.functionName, args: withMe(buy.args) },
  bal(up.token, up.symbol),
  bal(s.collateral, s.collateralSymbol + " left of 5"),
  { label: "approve " + up.symbol + " -> Swapr router", address: up.token, abi: erc20FullAbi, functionName: "approve", args: [dex.router, two] },
  { label: "exactInputSingle: sell exactly 2 " + up.symbol, address: dex.router, abi: sell.abi, functionName: sell.functionName, args: withMe(sell.args) },
  bal(up.token, up.symbol),
  bal(s.collateral, s.collateralSymbol + " after selling back"),
];
const r2 = await simulateSequence(client, wallet, swaps);
console.log("");
r2.results.forEach((x, i) => {
  const v = swaps[i].functionName === "balanceOf" && x.ok ? "   = " + Number(formatUnits(x.result as bigint, 18)).toFixed(4) : "";
  if (swaps[i].functionName !== "approve") console.log((x.ok ? "ok       " : "REVERTS  ") + x.label + v + (x.error ? "   <- " + x.error : ""));
});
console.log(r2.firstFailure < 0 ? "\nboth Algebra swap shapes succeed" : "\nFAILED at " + r2.results[r2.firstFailure].label);
