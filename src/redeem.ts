/**
 * `npm run redeem -- <market> [--chain 10] [--dry-run | --yes]`
 *
 * Cashes in outcome tokens after the oracle has finalized: winning tokens redeem 1:1 into collateral,
 * losing ones into nothing. Also the way out of an Invalid resolution, where every outcome pays pro rata.
 *
 * A conditional market redeems into its collateral, the parent market's outcome token; redeem the parent
 * afterwards (once it has resolved too) to turn that into sDAI. The command prints the follow-up.
 *
 * Signed the same way as every other money command (MetaMask by default, human confirms).
 */
import { formatUnits } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient, resolveSigner } from "./clients.js";
import { parseChainId } from "./config.js";
import { erc20FullAbi, seerRouterAbi } from "./dex.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { seerRouter, snapshot } from "./trade.js";
import { sendAndWait } from "./tx.js";

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
const dryRun = !!args["dry-run"];
const yes = !!args.yes;
if (!ref) {
  console.error("usage: npm run redeem -- <market> [--chain 10] [--dry-run | --yes]");
  process.exit(2);
}
if (!dryRun && !yes) {
  console.error("Refusing to send without --yes. Run with --dry-run first.");
  process.exit(2);
}

const parsed = parseMarketRef(ref);
const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);
const api = await fetchSeerMarket(chainId, parsed.idOrSlug);
if (!api) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ".");
  process.exit(1);
}
const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, api.id);

console.log("MARKET   " + snap.name);
console.log("         " + marketUrl(api));
console.log("resolved " + (snap.payoutReported ? "yes" : "NO - the oracle has not reported a payout yet"));
if (!snap.payoutReported) {
  console.log("");
  console.log("Nothing to redeem. Reality question " + (api.questions?.[0]?.id ?? "?") + " finalizes at " + (api.finalizeTs > 1e12 ? "(no answer yet)" : new Date(api.finalizeTs * 1000).toISOString()) + ".");
  process.exit(0);
}

const signer = await resolveSigner(chainId, { signer: args.signer as string | undefined, rpc: args.rpc as string | undefined, account: args.account as string | undefined, dryRun, noBatch: !!args["no-batch"] });
try {
  const account = signer.address;
  const indexes: bigint[] = [];
  const amounts: bigint[] = [];
  console.log("");
  console.log("holdings for " + account + ":");
  for (const pool of snap.pools) {
    const bal = await client.readContract({ address: pool.token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
    if (bal === 0n) continue;
    console.log("  [" + pool.index + "] " + snap.outcomes[pool.index].slice(0, 60).padEnd(62) + Number(formatUnits(bal, 18)).toFixed(4));
    indexes.push(BigInt(pool.index));
    amounts.push(bal);
  }
  if (!indexes.length) {
    console.log("  none");
    process.exit(0);
  }

  // the Router takes the ROOT collateral as its argument; for a conditional market it pays out the parent token
  const call = { address: seerRouter(chainId), abi: seerRouterAbi, functionName: "redeemPositions", args: [snap.rootCollateral, snap.market, indexes, amounts] } as const;
  const before = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  if (dryRun) {
    await client.simulateContract({ ...call, account });
    console.log("");
    console.log("DRY RUN: redeemPositions simulates cleanly. Re-run with --yes to send.");
    process.exit(0);
  }
  const walletClient = signer.walletClient();
  for (const pool of snap.pools) {
    const i = indexes.indexOf(BigInt(pool.index));
    if (i < 0) continue;
    const allowance = await client.readContract({ address: pool.token, abi: erc20FullAbi, functionName: "allowance", args: [account, seerRouter(chainId)] });
    if (allowance < amounts[i]) {
      await sendAndWait(walletClient, client, chainId, { address: pool.token, abi: erc20FullAbi, functionName: "approve", args: [seerRouter(chainId), amounts[i]] }, "approve " + pool.symbol + " -> Seer Router", (l) => console.log(l));
    }
  }
  await sendAndWait(walletClient, client, chainId, call, "redeem positions", (l) => console.log(l));
  const after = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  console.log("");
  console.log("redeemed " + Number(formatUnits(after - before, snap.collateralDecimals)).toFixed(4) + " " + snap.collateralSymbol);
  if (snap.parent) console.log("That is the parent's \"" + snap.parent.outcome + "\" token. Once the parent resolves:  npm run redeem -- " + snap.parent.market + " --chain " + chainId);
} finally {
  signer.close();
}
