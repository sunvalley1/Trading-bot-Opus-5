/** Simulate -> send -> wait, with the chain's fee floor. Throws on revert. */
import type { Abi, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { DEFAULT_RPC, type ChainId } from "./config.js";
import { getPublicClient } from "./clients.js";
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
  const hash = await walletClient.writeContract({ ...request, gas, account, chain: walletClient.chain });
  // Save the hash in the trade log before any RPC read can fail. A missing receipt is not a failed send.
  log(`  submitted ${label.padEnd(37)} ${hash}`);
  // a browser wallet broadcasts through its own RPC; give the public RPC time to see the transaction
  const receipt = await waitForReceipt(publicClient, getPublicClient(chainId, DEFAULT_RPC[chainId]), chainId, hash, log);
  log(`  tx ${label.padEnd(44)} ${hash}  gas ${receipt.gasUsed}`);
  return { hash, receipt };
}
