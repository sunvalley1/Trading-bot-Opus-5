/**
 * One-off probe of the Gnosis contracts the conditional-market work depends on. Read-only.
 *   npx tsx reports/gnosis-probe.ts
 */
import { createPublicClient, http, toFunctionSelector, parseAbi, type Address } from "viem";
import { gnosis } from "viem/chains";

const client = createPublicClient({ chain: gnosis, transport: http("https://rpc.gnosischain.com", { retryCount: 3 }) });
const ROUTER: Address = "0xffb643e73f280b97809a8b41f7232ab401a04ee1";
const QUOTER: Address = "0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7";
const FACTORY: Address = "0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766";
const SEER_ROUTER: Address = "0xeC9048b59b3467415b1a38F63416407eA0c70fB8";
const POOL: Address = "0xeB4eF079795cd0Ff2588f87322F00bd4faAfBa4e"; // DOWN / ARCADE_BOWLING pool of a conditional child

const candidates: Record<string, string[]> = {
  router: [
    "exactInputSingle((address,address,address,uint256,uint256,uint256,uint160))",
    "exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
    "exactOutputSingle((address,address,address,uint256,uint256,uint256,uint160))",
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
    "factory()",
    "poolDeployer()",
    "WNativeToken()",
  ],
  quoter: [
    "quoteExactInputSingle(address,address,uint256,uint160)",
    "quoteExactOutputSingle(address,address,uint256,uint160)",
    "quoteExactInputSingle((address,address,uint256,uint160))",
    "quoteExactOutputSingle((address,address,uint256,uint160))",
    "factory()",
    "poolDeployer()",
  ],
  seerRouter: [
    "splitPosition(address,address,uint256)",
    "mergePositions(address,address,uint256)",
    "redeemPositions(address,address,uint256[],uint256[])",
    "splitFromBase(address)",
    "mergeToBase(address,uint256)",
    "redeemToBase(address,uint256[],uint256[])",
    "conditionalTokens()",
  ],
};

async function codeHas(addr: Address, sigs: string[]) {
  const code = (await client.getCode({ address: addr })) ?? "0x";
  console.log("\n" + addr + "  bytecode " + (code.length - 2) / 2 + " bytes");
  for (const s of sigs) {
    const sel = toFunctionSelector("function " + s).slice(2);
    console.log("  " + (code.toLowerCase().includes("63" + sel) ? "HAS   " : "absent") + "  0x" + sel + "  " + s);
  }
}

await codeHas(ROUTER, candidates.router);
await codeHas(QUOTER, candidates.quoter);
await codeHas(SEER_ROUTER, candidates.seerRouter);

const f = await client.readContract({ address: QUOTER, abi: parseAbi(["function factory() view returns (address)"]), functionName: "factory" }).catch((e) => "error " + (e as Error).message.split("\n")[0]);
console.log("\nquoter.factory() = " + f + (typeof f === "string" && f.toLowerCase() === FACTORY.toLowerCase() ? "  (matches the Swapr AlgebraFactory)" : "  (does NOT match " + FACTORY + ")"));
const rf = await client.readContract({ address: ROUTER, abi: parseAbi(["function factory() view returns (address)"]), functionName: "factory" }).catch((e) => "error " + (e as Error).message.split("\n")[0]);
console.log("router.factory() = " + rf);

const poolAbi = parseAbi(["function token0() view returns (address)", "function token1() view returns (address)", "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)"]);
const [t0, t1, gs] = await Promise.all([
  client.readContract({ address: POOL, abi: poolAbi, functionName: "token0" }),
  client.readContract({ address: POOL, abi: poolAbi, functionName: "token1" }),
  client.readContract({ address: POOL, abi: poolAbi, functionName: "globalState" }),
]);
const p = (Number(gs[0]) / 2 ** 96) ** 2;
console.log("\npool token0 " + t0 + "\npool token1 " + t1 + "\nspot token1 per token0 = " + p.toFixed(6) + "   fee " + gs[2]);

const qAbi = parseAbi(["function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint16 fee)"]);
for (const amt of [10n ** 16n, 10n ** 18n, 50n * 10n ** 18n]) {
  try {
    const { result } = await client.simulateContract({ address: QUOTER, abi: qAbi, functionName: "quoteExactInputSingle", args: [t1, t0, amt, 0n] });
    const out = Number(result[0]) / 1e18;
    const inn = Number(amt) / 1e18;
    console.log("quote " + inn + " token1 -> " + out.toFixed(6) + " token0   avg price " + (inn / out).toFixed(6) + " token1 per token0   fee " + result[1]);
  } catch (e) {
    console.log("quote " + amt + " failed: " + (e as Error).message.split("\n")[0]);
  }
}
