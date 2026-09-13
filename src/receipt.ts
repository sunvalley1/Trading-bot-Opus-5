import type { Hex, PublicClient, TransactionReceipt } from "viem";
import type { ChainId } from "./config.js";

type ReceiptReader = Pick<PublicClient, "getChainId" | "waitForTransactionReceipt">;

/** Retry only receipt reads, never the transaction that has already been submitted. */
export async function waitForReceipt(
  primary: ReceiptReader,
  fallback: ReceiptReader,
  chainId: ChainId,
  hash: Hex,
  log: (line: string) => void = () => {},
): Promise<TransactionReceipt> {
  const query = { hash, timeout: 120_000, retryCount: 12, retryDelay: 2_000 };
  let receipt: TransactionReceipt;
  try {
    receipt = await primary.waitForTransactionReceipt(query);
  } catch {
    log(`  Receipt lookup failed; checking the same transaction ${hash} through the chain's default RPC.`);
    try {
      if (await fallback.getChainId() !== chainId) throw new Error("Receipt fallback is on the wrong chain");
      receipt = await fallback.waitForTransactionReceipt(query);
    } catch (cause) {
      throw new Error(
        `Transaction ${hash} was submitted, but its receipt could not be verified. ` +
        "Do not rerun the trade: check this hash and the wallet balances before continuing.",
        { cause },
      );
    }
  }
  if (receipt.status !== "success") throw new Error(`Transaction ${receipt.transactionHash} reverted`);
  return receipt;
}
