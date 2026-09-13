import type { Hex, PublicClient, TransactionReceipt } from "viem";
import type { ChainId } from "./config.js";

type ReceiptReader = Pick<PublicClient, "getChainId" | "waitForTransactionReceipt">;

/**
 * Errors that mean "the endpoint did not answer", as opposed to "the endpoint answered and the answer was no".
 * Rate limits, timeouts and dropped connections are worth waiting out: the transaction is already on its way,
 * and giving up early turns a confirmed transaction into an aborted trade (which is what happened to the first
 * scheduled Astra trade, whose approval had confirmed while the public RPC was refusing receipt reads).
 */
const RETRYABLE = /429|5\d\d|rate ?limit|capacity|exceeded|too many requests|request failed|requested resource not found|could not be found|not found|timeout|timed out|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|fetch failed|network|LimitExceeded|-32005|-32016|-32029|-32000/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keeps asking one reader for the receipt while it only fails for endpoint reasons, up to a time budget. */
async function patiently(reader: ReceiptReader, query: { hash: Hex; timeout: number; retryCount: number; retryDelay: number }, log: (line: string) => void, label: string, budgetMs: number): Promise<TransactionReceipt> {
  const start = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await reader.waitForTransactionReceipt(query);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!RETRYABLE.test(msg) || Date.now() - start > budgetMs) throw e;
      if (attempt === 1) log(`  ${label} RPC is slow or rate-limited; still waiting for the receipt of ${query.hash} (the transaction is already sent, nothing is resent).`);
      await sleep(Math.min(15_000, 3_000 * attempt));
    }
  }
}

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
    receipt = await patiently(primary, query, log, "primary", 180_000);
  } catch {
    log(`  Receipt lookup failed; checking the same transaction ${hash} through the chain's default RPC.`);
    try {
      if ((await fallback.getChainId()) !== chainId) throw new Error("Receipt fallback is on the wrong chain");
      receipt = await patiently(fallback, query, log, "default", 180_000);
    } catch (cause) {
      const why = ((cause as Error)?.message ?? String(cause)).split("\n")[0].slice(0, 160);
      log(`  receipt lookups exhausted: ${why}`);
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
