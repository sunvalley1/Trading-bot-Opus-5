/**
 * `npm run unstick -- --expect-account 0x.. [--chain 100] [--tip-gwei 2] [--max-fee-gwei 3] --dry-run|--yes`
 *
 * Clears transactions that a public endpoint accepted but never gossiped to validators, so they sit in one node's
 * mempool while every later nonce queues behind them. On 27 September that happened to Opus on Gnosis: seven
 * transactions pending on nonces 57-63 with only 56 mined, each carrying a healthy 1 gwei tip against a 9 wei base
 * fee and the wallet holding 0.98 xDAI - neither underpriced nor broke, simply never propagated. Every pass then
 * queued another trade behind the blockage, and had those seven ever mined the wallet would have filled the same
 * three Clement trades two and three times over at stale prices.
 *
 * For each stuck nonce this replaces the transaction with a zero-value send to the wallet itself - no approval, no
 * trade, nothing but the nonce consumed - at a fee high enough to displace the original, and pushes the signed
 * transaction to every endpoint rather than whichever one the fallback transport happens to pick, since a single
 * load balancer swallowing it is the whole problem. Then the bot plans again against today's prices.
 *
 * Refuses to run against a wallet other than --expect-account, and sends nothing without --yes.
 */
import { createPublicClient, formatEther, http, parseGwei, type Address, type Hex } from "viem";
import { parseArgs } from "./args.js";
import { getAccount, getPublicClient, getRpcUrls, getWalletClient } from "./clients.js";
import { CHAINS, parseChainId } from "./config.js";
import { startRunLog } from "./runlog.js";
import { waitForReceipt } from "./receipt.js";

const args = parseArgs(process.argv.slice(2));
const chainId = parseChainId(args.chain as string | undefined);
const dryRun = !args.yes;
startRunLog("unstick");

const account = getAccount();
const expect = args["expect-account"] as string | undefined;
if (!expect) {
  console.error("Pass --expect-account 0x.. : this signs with the key in this folder's .env, and the wallet must be the one you mean.");
  process.exit(2);
}
if (expect.toLowerCase() !== account.address.toLowerCase()) {
  console.error("--expect-account " + expect + " is not this folder's wallet (" + account.address + "). Nothing sent.");
  process.exit(2);
}

const client = getPublicClient(chainId);
const [mined, pending] = await Promise.all([client.getTransactionCount({ address: account.address, blockTag: "latest" }), client.getTransactionCount({ address: account.address, blockTag: "pending" })]);
const stuck = pending - mined;
console.log("UNSTICK  " + account.address + " on " + CHAINS[chainId].name);
console.log("         nonce " + mined + " mined, " + pending + " pending -> " + (stuck > 0 ? stuck + " transaction(s) to replace (nonces " + mined + ".." + (pending - 1) + ")" : "nothing stuck"));
console.log("         gas balance " + Number(formatEther(await client.getBalance({ address: account.address }))).toFixed(6) + " " + (chainId === 100 ? "xDAI" : "ETH"));
if (stuck <= 0) process.exit(0);

const tip = parseGwei(String(args["tip-gwei"] ?? 2));
const maxFee = parseGwei(String(args["max-fee-gwei"] ?? 3));
console.log("         replacing each with a 0-value self-send at maxFee " + Number(maxFee) / 1e9 + " gwei, tip " + Number(tip) / 1e9 + " gwei (the stuck ones carry 1 gwei)");
console.log("");

if (dryRun) {
  for (let nonce = mined; nonce < pending; nonce++) console.log("  would replace nonce " + nonce);
  console.log("");
  console.log("Dry run: nothing was sent. Add --yes to send.");
  process.exit(0);
}

const wallet = getWalletClient(chainId);
const urls = getRpcUrls(chainId);

for (let nonce = mined; nonce < pending; nonce++) {
  const signed = (await wallet.signTransaction({
    account,
    chain: CHAINS[chainId],
    to: account.address as Address,
    value: 0n,
    data: "0x",
    nonce,
    gas: 21_000n,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: tip,
  })) as Hex;

  // every endpoint, not just the one the fallback transport picks: one node holding it alone is what caused this
  let hash: Hex | undefined;
  const refused: string[] = [];
  for (const url of urls) {
    try {
      const h = await createPublicClient({ chain: CHAINS[chainId], transport: http(url, { retryCount: 1 }) }).sendRawTransaction({ serializedTransaction: signed });
      hash = h;
    } catch (e) {
      refused.push(url.replace(/^https?:\/\//, "").split("/")[0] + ": " + ((e as Error).message ?? "").split("\n")[0].slice(0, 60));
    }
  }
  if (!hash) {
    console.log("  nonce " + nonce + ": every endpoint refused the replacement");
    for (const r of refused) console.log("      " + r);
    process.exit(1);
  }
  console.log("  nonce " + nonce + ": sent " + hash + " to " + (urls.length - refused.length) + " of " + urls.length + " endpoint(s)");
  try {
    const receipt = await waitForReceipt(client, client, chainId, hash, (l) => console.log(l));
    console.log("      mined in block " + receipt.blockNumber + ", gas " + receipt.gasUsed);
  } catch (e) {
    console.log("      receipt not confirmed: " + ((e as Error).message ?? "").split("\n")[0]);
  }
}

const after = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
const mined2 = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
console.log("");
console.log("UNSTICK  done: nonce " + mined2 + " mined, " + after + " pending" + (after === mined2 ? " - the queue is clear" : " - " + (after - mined2) + " still pending"));
