import "dotenv/config";
import { createPublicClient, createWalletClient, custom, fallback, http, isAddress, type Address, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, DEFAULT_RPC, type ChainId } from "./config.js";
import { attachToSigner, startMetaMaskBridge } from "./metamask-bridge.js";

/**
 * Every endpoint for a chain, best first: --rpc, then RPC_URL_<chainId>, then RPC_URL only when this is the folder's
 * own chain (CHAIN_ID, default 10), and then the public ones. RPC_URL is a key for one network; sending a Gnosis read
 * to the Optimism endpoint returned "no data" from contracts that do not exist there.
 *
 * The configured value may list several endpoints, comma separated, and they are tried in that order before any
 * public one: that is where a second paid node goes, for the day the first runs out of credit.
 */
export function getRpcUrls(chainId: ChainId, override?: string): string[] {
  const perChain = process.env["RPC_URL_" + chainId];
  const own = process.env.RPC_URL && Number(process.env.CHAIN_ID ?? 10) === Number(chainId) ? process.env.RPC_URL : undefined;
  const configured = (override ?? perChain ?? own ?? DEFAULT_RPC[chainId]).split(",").map((u) => u.trim()).filter(Boolean);
  const public_ = [DEFAULT_RPC[chainId], ...(FALLBACK_RPC[chainId] ?? [])];
  return [...configured, ...public_.filter((u) => !configured.includes(u))];
}

/** The endpoint a chain is read through first - what a command prints, and what the MetaMask page is pointed at. */
export function getRpcUrl(chainId: ChainId, override?: string): string {
  return getRpcUrls(chainId, override)[0];
}

/**
 * Public endpoints to fall through to, in order. Five bots reading the same pools twice a day, plus a pass that fans
 * out market reports in parallel, is more than the free endpoints tolerate, and a paid node can run out of credit
 * mid-cycle; viem's fallback transport moves to the next endpoint on any error that is not deterministic (a revert or
 * a rejected transaction), so a rate limit, a 402 for exhausted credit or a dead host all land on the next one.
 * The chains' own official endpoints come last because both answered 403 from here on 22 September.
 */
const FALLBACK_RPC: Partial<Record<ChainId, string[]>> = {
  10: ["https://optimism-rpc.publicnode.com", "https://1rpc.io/op", "https://mainnet.optimism.io"],
  100: ["https://gnosis-rpc.publicnode.com", "https://1rpc.io/gnosis", "https://rpc.gnosischain.com"],
};

export function getPublicClient(chainId: ChainId, rpcUrl?: string) {
  const [primary, ...others] = getRpcUrls(chainId, rpcUrl);
  const transport = others.length
    ? fallback([http(primary, { retryCount: 2, retryDelay: 400 }), ...others.map((u) => http(u, { retryCount: 1, retryDelay: 400 }))], { rank: false, retryCount: 1 })
    : http(primary, { retryCount: 3, retryDelay: 400 });
  return createPublicClient({ chain: CHAINS[chainId], transport });
}

/** Loads PRIVATE_KEY from the environment (.env). Never logs it. */
export function getAccount() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("PRIVATE_KEY is missing or malformed. Run `npm run new-wallet` to create a throwaway key in .env.");
  }
  return privateKeyToAccount(pk as Hex);
}

/**
 * Key-mode wallet client. Sends are sequential and each waits for its receipt, so a fallback list is safe here too:
 * a signed transaction has one nonce and one hash whichever endpoint carries it, so a re-send after a failed
 * response is the same transaction, not a second one. What matters is patience: the free endpoints answer "requests
 * per second exceeded" when several bots run at once, and viem's retry backoff doubles each time (1s, 2s, 4s, 8s,
 * 16s), which outlasts a rate-limit window.
 */
export function getWalletClient(chainId: ChainId, rpcUrl?: string) {
  const [primary, ...others] = getRpcUrls(chainId, rpcUrl);
  const transport = others.length
    ? fallback([http(primary, { retryCount: 5, retryDelay: 1000 }), ...others.map((u) => http(u, { retryCount: 2, retryDelay: 1000 }))], { rank: false, retryCount: 1 })
    : http(primary, { retryCount: 5, retryDelay: 1000 });
  return createWalletClient({
    chain: CHAINS[chainId],
    transport,
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
