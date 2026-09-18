/**
 * `npm run redeem -- <market> [--chain 10] [--expect-account 0x..] [--dry-run | --yes]`
 *
 * Cashes in outcome tokens after the oracle has finalized: winning tokens redeem 1:1 into collateral,
 * losing ones into nothing. Also the way out of an Invalid resolution, where every outcome pays pro rata.
 *
 * A conditional market redeems into its collateral, the parent market's outcome token; redeem the parent
 * afterwards (once it has resolved too) to turn that into sDAI. The command prints the follow-up.
 *
 * The queue executor runs this by itself for every resolved market the folder's wallet still holds tokens in
 * (see redeem-sweep.ts), with --expect-account. The approvals and the redemption are simulated together, in
 * order, before anything is sent. Signed the same way as every other money command.
 */
import { formatUnits, getAddress, isAddress, isAddressEqual, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient, resolveSigner } from "./clients.js";
import { parseChainId } from "./config.js";
import { erc20FullAbi, seerRouterAbi } from "./dex.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { simulateSequence, type PlannedCall } from "./simulate.js";
import { seerRouter, snapshot } from "./trade.js";
import { sendAndWait } from "./tx.js";
import { startRunLog } from "./runlog.js";

startRunLog("redeem");

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
const dryRun = !!args["dry-run"];
const yes = !!args.yes;
if (!ref) {
  console.error("usage: npm run redeem -- <market> [--chain 10] [--expect-account 0x..] [--dry-run | --yes]");
  process.exit(2);
}
if (!dryRun && !yes) {
  console.error("Refusing to send without --yes. Run with --dry-run first.");
  process.exit(2);
}

const parsed = parseMarketRef(ref);
const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);
// as in trade-run: the website only turns a slug into an address; given an address, the chain alone decides
const api = await fetchSeerMarket(chainId, parsed.idOrSlug).catch(() => undefined);
if (!api && !isAddress(parsed.idOrSlug, { strict: false })) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ", and it is not an address.");
  process.exit(1);
}
const marketAddress = (api?.id ?? getAddress(parsed.idOrSlug)) as Address;
const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, marketAddress);
const router = seerRouter(chainId);

console.log("MARKET   " + snap.name);
console.log("         " + (api ? marketUrl(api) : "https://app.seer.pm/markets/" + chainId + "/" + marketAddress));
console.log("resolved " + (snap.payoutReported ? "yes" : "NO - the oracle has not reported a payout yet"));
if (!snap.payoutReported) {
  console.log("");
  console.log("Nothing to redeem yet." + (api ? " Reality question " + (api.questions?.[0]?.id ?? "?") + " finalizes at " + (api.finalizeTs > 1e12 ? "(no answer yet)" : new Date(api.finalizeTs * 1000).toISOString()) + "." : ""));
  process.exit(0);
}

const signer = await resolveSigner(chainId, { signer: args.signer as string | undefined, rpc: args.rpc as string | undefined, account: args.account as string | undefined, dryRun, noBatch: !!args["no-batch"] });
try {
  const account = signer.address;

  // the same folder and wallet guards as trade-run and unwind
  const expected = args["expect-account"] as string | undefined;
  const own = process.env.LIQUIDITY_WALLET;
  if (own && isAddress(own, { strict: false }) && expected && isAddress(expected, { strict: false }) && !isAddressEqual(own as Address, expected as Address)) {
    console.error("WRONG FOLDER OR WALLET. Refusing: this folder's LIQUIDITY_WALLET is " + getAddress(own) + ", --expect-account is " + getAddress(expected) + ".");
    process.exit(1);
  }
  if (expected && (!isAddress(expected, { strict: false }) || !isAddressEqual(expected as Address, account))) {
    console.error("WRONG WALLET. Refusing: --expect-account " + expected + ", connected " + getAddress(account) + ".");
    process.exit(1);
  }

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
  const call = { address: router, abi: seerRouterAbi, functionName: "redeemPositions", args: [snap.rootCollateral, snap.market, indexes, amounts] } as const;
  const before = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });

  // the Router pulls every token it redeems: an approval for each one short of its allowance, then the redemption
  const approvals: PlannedCall[] = [];
  for (const [k, idx] of indexes.entries()) {
    const pool = snap.pools[Number(idx)];
    const allowance = await client.readContract({ address: pool.token, abi: erc20FullAbi, functionName: "allowance", args: [account, router] });
    if (allowance < amounts[k]) approvals.push({ label: "approve " + pool.symbol + " -> Seer Router", address: pool.token, abi: erc20FullAbi, functionName: "approve", args: [router, amounts[k]] });
  }
  const sim = await simulateSequence(client, account, [...approvals, { label: "redeem positions", ...call }]);
  if (sim.supported) {
    for (const r of sim.results) console.log("  " + (r.ok ? "ok       " : "REVERTS  ") + r.label + (r.error ? "   <- " + r.error : ""));
    if (sim.firstFailure >= 0) {
      console.error("REFUSING: the redemption reverts in simulation. Nothing was sent.");
      process.exit(1);
    }
  } else if (dryRun) {
    console.log("  (eth_simulateV1 is unavailable on this RPC, so the approvals and the redemption were not simulated together)");
  }
  if (dryRun) {
    console.log("");
    console.log("DRY RUN: " + (sim.supported ? "the approvals and the redemption simulate cleanly." : "nothing simulated.") + " Re-run with --yes to send.");
    process.exit(0);
  }
  const walletClient = signer.walletClient();
  for (const a of approvals) await sendAndWait(walletClient, client, chainId, a, a.label, (l) => console.log(l));
  await sendAndWait(walletClient, client, chainId, call, "redeem positions", (l) => console.log(l));
  const after = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  console.log("");
  console.log("redeemed " + Number(formatUnits(after - before, snap.collateralDecimals)).toFixed(4) + " " + snap.collateralSymbol);
  if (snap.parent) console.log("That is the parent's \"" + snap.parent.outcome + "\" token. Once the parent resolves:  npm run redeem -- " + snap.parent.market + " --chain " + chainId);
} finally {
  signer.close();
}
