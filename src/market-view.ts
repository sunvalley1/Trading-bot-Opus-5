/**
 * The small read-side of Seer that trading needs: what a market is, and what gas costs.
 *
 * These lived in the market-creation project (`seer.ts`, `validate.ts`) alongside a great deal of code a
 * trader never touches - spec parsing, policy validation, calldata builders for the MarketFactory. They are
 * reproduced here unchanged so this repository stands alone and depends on nothing but viem and dotenv.
 */
import type { Address, PublicClient } from "viem";
import { marketViewAbi } from "./abis.js";
import { SEER_ADDRESSES, type ChainId } from "./config.js";

/** Everything MarketView knows about a market: name, outcomes, wrapped outcome tokens, collateral, payout state. */
export async function readMarket(client: PublicClient, chainId: ChainId, market: Address) {
  return client.readContract({
    address: SEER_ADDRESSES[chainId].MarketView,
    abi: marketViewAbi,
    functionName: "getMarket",
    args: [SEER_ADDRESSES[chainId].MarketFactory, market],
  });
}

export type MarketInfo = Awaited<ReturnType<typeof readMarket>>;

/**
 * Minimum priority fee per chain. Gnosis validators ignore transactions tipping under 1 gwei, so a public RPC's
 * estimate can leave a transaction pending forever there. Other chains use the RPC's estimate as-is.
 */
const TIP_FLOOR: Partial<Record<ChainId, bigint>> = { 100: 1_000_000_000n };

export async function estimateFees(client: PublicClient, chainId: ChainId): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const fees = await client.estimateFeesPerGas();
  let maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
  let maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;
  const floor = TIP_FLOOR[chainId];
  if (floor && maxPriorityFeePerGas < floor) {
    const block = await client.getBlock();
    maxPriorityFeePerGas = floor;
    maxFeePerGas = (block.baseFeePerGas ?? 0n) * 2n + floor;
  }
  return { maxFeePerGas, maxPriorityFeePerGas };
}

/** Unix seconds -> ISO 8601 without the milliseconds. */
export function iso(ts: number): string {
  return new Date(ts * 1000).toISOString().replace(".000Z", "Z");
}
