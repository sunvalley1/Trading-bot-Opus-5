import "dotenv/config";
import { createPublicClient, createWalletClient, custom, http, isAddress, type Address, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, DEFAULT_RPC, type ChainId } from "./config.js";
import { attachToSigner, startMetaMaskBridge } from "./metamask-bridge.js";

export function getRpcUrl(chainId: ChainId, override?: string): string {
  return override || process.env.RPC_URL || DEFAULT_RPC[chainId];
}

export function getPublicClient(chainId: ChainId, rpcUrl?: string) {
  return createPublicClient({ chain: CHAINS[chainId], transport: http(getRpcUrl(chainId, rpcUrl)) });
}

/** Loads PRIVATE_KEY from the environment (.env). Never logs it. */
export function getAccount() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("PRIVATE_KEY is missing or malformed. Run `npm run new-wallet` to create a throwaway key in .env.");
  }
  return privateKeyToAccount(pk as Hex);
}

export function getWalletClient(chainId: ChainId, rpcUrl?: string) {
  return createWalletClient({
    chain: CHAINS[chainId],
    transport: http(getRpcUrl(chainId, rpcUrl)),
    account: getAccount(),
  });
}

export type SignerMode = "key" | "metamask";

export interface Signer {
  mode: SignerMode;
  address: Address;
  /** created lazily for the key signer; for MetaMask it is the bridge-backed client */
  walletClient: () => WalletClient;
  /** present when the wallet can execute atomic batches (MetaMask smart account on this chain): one confirmation per batch */
  batch?: (calls: Array<{ to: Address; data: Hex; value: bigint; label?: string }>, label: string) => Promise<Hex[]>;
  /** stops the local bridge server (MetaMask mode) so the process can exit */
  close: () => void;
}

/**
 * Resolves who signs the transactions of a liquidity command.
 *  - "key": the bot wallet from .env (PRIVATE_KEY).
 *  - "metamask": the user's browser wallet through the local bridge page (no key on this machine).
 * Default comes from LIQUIDITY_SIGNER in .env, then "key". `--account 0x..` plans a MetaMask run without opening
 * the browser (dry runs).
 */
export async function resolveSigner(chainId: ChainId, opts: { signer?: string; rpc?: string; account?: string; dryRun?: boolean; noBatch?: boolean }): Promise<Signer> {
  const mode = ((opts.signer || process.env.LIQUIDITY_SIGNER || "key").toLowerCase() as SignerMode) === "metamask" ? "metamask" : "key";
  if (mode === "key") {
    const address = getAccount().address;
    return { mode, address, walletClient: () => getWalletClient(chainId, opts.rpc), close: () => {} };
  }
  if (opts.dryRun && opts.account && isAddress(opts.account)) {
    return { mode, address: opts.account as Address, walletClient: () => { throw new Error("dry run: no signer"); }, close: () => {} };
  }
  const rpcUrl = getRpcUrl(chainId, opts.rpc);
  // a signer page started with `npm run signer` takes the work (one tab for the whole session); otherwise open our own
  const bridge = (process.env.BRIDGE_NO_ATTACH ? undefined : await attachToSigner(chainId, rpcUrl)) ?? (await startMetaMaskBridge(chainId, rpcUrl));
  if (bridge.attached) console.log(`MetaMask signer: using the signer tab already open (${bridge.url}); confirm there.`);
  else
    console.log(
      `MetaMask signer: a page has been opened in your browser (${bridge.url}).\nConnect the wallet you want to use for liquidity; every transaction will then ask for your confirmation in MetaMask.\n(tip: \`npm run signer\` once per session keeps a single tab for all commands)`,
    );
  const address = await bridge.account;
  const atomic = (await bridge.atomic) && !opts.noBatch;
  console.log(`Connected wallet ${address}. Batching: ${atomic ? "available, one confirmation per batch" : "not available, one confirmation per transaction"}\n`);
  const walletClient = createWalletClient({ chain: CHAINS[chainId], transport: custom(bridge.provider), account: address });
  return { mode, address, walletClient: () => walletClient, batch: atomic ? bridge.sendCalls : undefined, close: () => bridge.close() };
}
