import assert from "node:assert/strict";
import test from "node:test";
import type { Hex, PublicClient, TransactionReceipt } from "viem";
import { waitForReceipt } from "../src/receipt.js";

const hash: Hex = `0x${"12".repeat(32)}`;
const receipt = { transactionHash: hash, status: "success" } as TransactionReceipt;
type Reader = Pick<PublicClient, "getChainId" | "waitForTransactionReceipt">;
function reader(wait: (request: { hash: Hex }) => Promise<TransactionReceipt>, chain = 10): Reader {
  return { getChainId: async () => chain, waitForTransactionReceipt: wait } as Reader;
}
const unavailable = reader(async () => { throw new Error("Archive requests require a personal token"); });

test("a successful primary receipt does not contact the fallback", async () => {
  const fallback = reader(async () => { assert.fail("unexpected fallback"); });
  assert.equal(await waitForReceipt(reader(async () => receipt), fallback, 10, hash), receipt);
});

test("an archive restriction falls back to the same hash on the expected chain", async () => {
  const reads: Hex[] = [];
  const fallback = reader(async request => { reads.push(request.hash); return receipt; });
  assert.equal(await waitForReceipt(unavailable, fallback, 10, hash), receipt);
  assert.deepEqual(reads, [hash]);
});

test("a reverted transaction is final and does not trigger a fallback", async () => {
  const fallback = reader(async () => { assert.fail("must not retry a reverted transaction"); });
  await assert.rejects(waitForReceipt(reader(async () => ({ ...receipt, status: "reverted" })), fallback, 10, hash), /reverted/);
});

test("a fallback on another chain cannot authorize the next leg", async () => {
  const fallback = reader(async () => { assert.fail("must not read the wrong chain"); }, 100);
  await assert.rejects(waitForReceipt(unavailable, fallback, 10, hash), /Do not rerun the trade/);
});

test("if both RPCs fail, the error preserves the hash and prohibits resubmission", async () => {
  await assert.rejects(waitForReceipt(unavailable, unavailable, 10, hash), error => {
    assert.match((error as Error).message, new RegExp(hash));
    assert.match((error as Error).message, /was submitted/);
    assert.match((error as Error).message, /Do not rerun the trade/);
    return true;
  });
});

test("a reverted receipt from the fallback also stops execution", async () => {
  const fallback = reader(async () => ({ ...receipt, status: "reverted" }));
  await assert.rejects(waitForReceipt(unavailable, fallback, 10, hash), /reverted/);
});
