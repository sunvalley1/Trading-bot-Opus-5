/** Simulate -> send -> wait, with the chain's fee floor. Throws on revert. */
import { createPublicClient, encodeFunctionData, http, type Abi, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { CHAINS, DEFAULT_RPC, type ChainId } from "./config.js";
import { getPublicClient, getRpcUrls } from "./clients.js";
import { setPendingLabel } from "./metamask-bridge.js";
import { estimateFees } from "./market-view.js";
import { waitForReceipt } from "./receipt.js";

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TxResult {
  hash: Hex;
  receipt: TransactionReceipt;
}

export type TxLogger = (line: string) => void;

/** Pushes one signed transaction to every endpoint and returns its hash, failing only if all of them refuse it. */
async function broadcastEverywhere(chainId: ChainId, serializedTransaction: Hex, log: TxLogger): Promise<Hex> {
  const urls = getRpcUrls(chainId);
  const refused: string[] = [];
  let hash: Hex | undefined;
  for (const url of urls) {
    try {
      hash = await createPublicClient({ chain: CHAINS[chainId], transport: http(url, { retryCount: 1 }) }).sendRawTransaction({ serializedTransaction });
    } catch (e) {
      refused.push(url.replace(/^https?:\/\//, "").split("/")[0] + " (" + ((e as Error).message ?? "").slice(0, 70) + ")");
    }
  }
  if (!hash) throw new Error("no endpoint accepted the transaction: " + refused.join("; "));
  if (refused.length) log("  accepted by " + (urls.length - refused.length) + " of " + urls.length + " endpoints; refused by " + refused.join("; "));
  return hash;
}

export async function sendAndWait(
  walletClient: WalletClient,
  publicClient: PublicClient,
  chainId: ChainId,
  call: ContractCall,
  label: string,
  log: TxLogger = () => {},
): Promise<TxResult> {
  const account = walletClient.account;
  if (!account) throw new Error("wallet client has no account");
  const fees = await estimateFees(publicClient, chainId);
  const { request } = await publicClient.simulateContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args ?? [],
    value: call.value,
    account,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });
  // Public RPCs estimate against the latest block; the real execution lands in a later block where paths can cost
  // more (e.g. a fresh Algebra pool writing a new timepoint). Add a 30% buffer, at least 100k gas.
  const estimate = await publicClient.estimateContractGas({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args ?? [],
    value: call.value,
    account,
  });
  const gas = estimate + (estimate * 30n) / 100n + 100_000n;
  setPendingLabel(label); // shown on the MetaMask bridge page when the user signs
  // A wallet client sends through one endpoint at a time. On 27 September a Gnosis endpoint accepted seven of Opus's
  // transactions and never gossiped them: each sat in that node's mempool with a 1 gwei tip it did not need, the
  // nonces behind it queued for a day, and every pass added another. Signing here and pushing the identical raw
  // transaction to every endpoint costs nothing - same nonce, same hash, so there is no second send to fear - and no
  // single load balancer can keep it to itself. A browser wallet signs and broadcasts on its own, so it is left alone.
  const hash =
    account.type === "local"
      ? await broadcastEverywhere(chainId, await walletClient.signTransaction({
          account,
          chain: walletClient.chain,
          to: call.address,
          data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args ?? [] }),
          value: call.value ?? 0n,
          gas,
          nonce: await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        }), log)
      : await walletClient.writeContract({ ...request, gas, account, chain: walletClient.chain });
  // Save the hash in the trade log before any RPC read can fail. A missing receipt is not a failed send.
  log(`  submitted ${label.padEnd(37)} ${hash}`);
  // a browser wallet broadcasts through its own RPC; give the public RPC time to see the transaction
  const receipt = await waitForReceipt(publicClient, getPublicClient(chainId, DEFAULT_RPC[chainId]), chainId, hash, log);
  log(`  tx ${label.padEnd(44)} ${hash}  gas ${receipt.gasUsed}`);
  return { hash, receipt };
}
