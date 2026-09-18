/**
 * Simulates a whole multi-transaction trade in order, against the current chain state, before anything is sent.
 *
 * A trade here is several transactions (approve, split, one swap per outcome), and each one depends on the
 * tokens the previous one produced. Simulating them one at a time can only check the first: the rest fail for
 * want of tokens that do not exist yet. eth_simulateV1 carries the state from call to call, so the sequence is
 * checked as it will actually run. That matters most before a live send: a sequence that would revert at the
 * third leg is caught before the first two are mined and the wallet is left holding half a trade.
 *
 * Not every RPC serves eth_simulateV1. When it is refused, `supported` is false and the caller falls back to
 * what it did before (per-leg simulation, or none); a missing feature must never stop a trade on its own.
 */
import type { Abi, Address, PublicClient } from "viem";
import type { ContractCall } from "./tx.js";

export interface PlannedCall extends ContractCall {
  label: string;
}

export interface SequenceResult {
  /** false when the RPC does not serve eth_simulateV1 (or the request itself failed): nothing was checked */
  supported: boolean;
  /** why `supported` is false */
  unsupportedReason?: string;
  /** `result` is the decoded return value, e.g. of a balance read placed in the sequence */
  results: Array<{ label: string; ok: boolean; error?: string; result?: unknown }>;
  /** index of the first call that reverts, or -1 when the whole sequence succeeds */
  firstFailure: number;
}

// Nodes share the block's gas limit out between the calls of a simulated block (Gnosis: 17M / 24 calls is about
// 700k each), which starves a split into eight outcomes (about 1M gas) and makes it "revert" with no data. The
// block's gas limit is overridden to 30M per call, so a call can only fail here for a reason it would fail for real.
const GAS_PER_CALL = 30_000_000n;

export async function simulateSequence(client: PublicClient, account: Address, calls: PlannedCall[]): Promise<SequenceResult> {
  if (!calls.length) return { supported: true, results: [], firstFailure: -1 };
  try {
    const [block] = await client.simulateBlocks({
      blocks: [
        {
          blockOverrides: { gasLimit: GAS_PER_CALL * BigInt(calls.length) },
          calls: calls.map((c) => ({ account, to: c.address, abi: c.abi as Abi, functionName: c.functionName, args: c.args ?? [], value: c.value })) as never,
        },
      ],
    });
    const out = (block.calls as Array<{ status: string; error?: Error; result?: unknown }>).map((r, i) => ({
      label: calls[i].label,
      ok: r.status === "success",
      error: r.status === "success" ? undefined : (r.error?.message ?? "reverted").split("\n")[0].slice(0, 160),
      result: r.result,
    }));
    return { supported: true, results: out, firstFailure: out.findIndex((r) => !r.ok) };
  } catch (e) {
    return { supported: false, unsupportedReason: (e as Error).message.split("\n")[0].slice(0, 120), results: [], firstFailure: -1 };
  }
}
