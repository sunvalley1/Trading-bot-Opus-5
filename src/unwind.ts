/**
 * `npm run unwind -- <market> [--chain 10] --expect-account 0x.. [--account 0x..] [--sell-only | --merge-only]
 *                     [--slippage 0.02] [--dry-run | --yes]`
 *
 * Turns an open position back into collateral BEFORE the oracle resolves, the cheap way. (After resolution,
 * `npm run redeem` is the exit.)
 *
 * Two routes, both quoted live against the pools, and the one that returns more collateral is taken:
 *
 *   merge : buy back the outcome(s) that were sold until the wallet holds complete sets, then merge the sets
 *           1:1 into collateral through the Seer Router. Possible only when the wallet holds every outcome that
 *           has no pool (normally Invalid), because that leg cannot be bought. This is usually far better than
 *           selling: a leg you sold is cheap to buy back precisely because your own sale left it cheap, and the
 *           merge pays a full 1.0 per set. On a real 300-set fade it recovered all but a few cents.
 *   sell  : sell every outcome that has a pool into that pool. The honest floor, and the only route out of a
 *           position bought directly (no Invalid tokens to complete a set with).
 *
 * Tokens above the merged sets are sold as well; tokens of outcomes without a pool stay in the wallet. When
 * neither route returns anything, the command says so and sends nothing.
 *
 * Signing is the same as every other money command in this repository: nothing is sent without --yes, and
 * every transaction is confirmed by the human's wallet (or, in an experiment the human has chosen to run
 * unattended, by the key that human placed in this folder's .env). `--expect-account` is required for --yes.
 */
import { formatUnits, getAddress, isAddress, isAddressEqual, type Abi, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient, resolveSigner } from "./clients.js";
import { CHAIN_NAMES, parseChainId } from "./config.js";
import { erc20FullAbi, getDex, quoteExactIn, quoteExactOut, seerRouterAbi, univ3RouterAbi } from "./dex.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { seerRouter, snapshot } from "./trade.js";
import { sendAndWait } from "./tx.js";
import { startRunLog } from "./runlog.js";

startRunLog("unwind");

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
const dryRun = !!args["dry-run"];
const yes = !!args.yes;
const sellOnly = !!args["sell-only"];
const mergeOnly = !!args["merge-only"];
const slippageTol = Number(args.slippage ?? 0.02);

if (!ref) {
  console.error("usage: npm run unwind -- <market> [--chain 10] --expect-account 0x.. [--account 0x..] [--sell-only | --merge-only] [--slippage 0.02] [--dry-run | --yes]");
  process.exit(2);
}
if (!dryRun && !yes) {
  console.error("Refusing to send without --yes. Run with --dry-run first and have a human approve the result.");
  process.exit(2);
}
if (sellOnly && mergeOnly) {
  console.error("--sell-only and --merge-only exclude each other.");
  process.exit(2);
}
if (!(slippageTol > 0 && slippageTol < 0.5)) {
  console.error("--slippage must be between 0 and 0.5.");
  process.exit(2);
}

const parsed = parseMarketRef(ref);
const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);
let api = await fetchSeerMarket(chainId, parsed.idOrSlug).catch(() => undefined);
if (!api && !isAddress(parsed.idOrSlug, { strict: false })) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ", and it is not an address.");
  process.exit(1);
}
const marketAddress = (api?.id ?? getAddress(parsed.idOrSlug)) as Address;
const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, marketAddress);
const dex = getDex(chainId);
if (dex.kind !== "univ3") {
  console.error("unwind is implemented for Uniswap v3 chains (Optimism). " + dex.name + " on chain " + chainId + " is not supported yet.");
  process.exit(1);
}
if (snap.payoutReported) {
  console.error("This market is already resolved: use `npm run redeem -- " + marketAddress + " --chain " + chainId + "` instead.");
  process.exit(1);
}

console.log("MARKET   " + snap.name);
console.log("         " + (api ? marketUrl(api) : "https://app.seer.pm/markets/" + chainId + "/" + marketAddress));
console.log("");

const signer = await resolveSigner(chainId, { signer: args.signer as string | undefined, rpc: args.rpc as string | undefined, account: args.account as string | undefined, dryRun, noBatch: !!args["no-batch"] });
try {
  const account = signer.address;
  console.log("SIGNER   " + signer.mode + "  " + account);

  // Same guards as trade-run: the folder's wallet (MODELS.md), the expected account, and the chain.
  const expected = args["expect-account"] as string | undefined;
  const own = process.env.LIQUIDITY_WALLET;
  if (own && isAddress(own, { strict: false }) && expected && isAddress(expected, { strict: false }) && !isAddressEqual(own as Address, expected as Address)) {
    console.error("");
    console.error("WRONG FOLDER OR WALLET. Refusing.");
    console.error("  this folder's .env (LIQUIDITY_WALLET" + (process.env.MODEL_NAME ? ", model " + process.env.MODEL_NAME : "") + "): " + getAddress(own));
    console.error("  --expect-account                       : " + getAddress(expected));
    process.exit(1);
  }
  if (process.env.MODEL_NAME) console.log("MODEL    " + process.env.MODEL_NAME + "   wallet " + (own ?? "(LIQUIDITY_WALLET unset)"));
  if (yes && !expected) {
    console.error("--expect-account is required with --yes: say which wallet this unwind is for.");
    process.exit(2);
  }
  if (expected) {
    if (!isAddress(expected, { strict: false })) {
      console.error("--expect-account is not a valid address: " + expected);
      process.exit(2);
    }
    if (!isAddressEqual(expected as Address, account)) {
      console.error("");
      console.error("WRONG WALLET. Refusing.");
      console.error("  expected (--expect-account): " + getAddress(expected));
      console.error("  actually connected         : " + getAddress(account));
      process.exit(1);
    }
    console.log("         wallet matches --expect-account");
  }
  if (!dryRun) {
    const walletChain = await signer.walletClient().getChainId().catch(() => undefined);
    if (walletChain !== undefined && walletChain !== Number(chainId)) {
      console.error("WRONG NETWORK: this market is on chain " + chainId + " (" + CHAIN_NAMES[chainId] + "), the wallet is on chain " + walletChain + ".");
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------- holdings
  const holding: bigint[] = [];
  console.log("");
  console.log("HOLDINGS");
  for (const p of snap.pools) {
    const bal = await client.readContract({ address: p.token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
    holding.push(bal);
    if (bal > 0n) console.log("  [" + p.index + "] " + snap.outcomes[p.index].slice(0, 56).padEnd(58) + Number(formatUnits(bal, 18)).toFixed(4).padStart(12) + (p.exists ? "   pool spot " + (p.price ?? 0).toFixed(4) : "   no pool"));
  }
  if (holding.every((h) => h === 0n)) {
    console.log("  none - nothing to unwind on this market.");
    process.exit(0);
  }
  const before = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });

  const fmt = (x: bigint) => Number(formatUnits(x, snap.collateralDecimals)).toFixed(4);
  const dec = snap.collateralDecimals;

  // ---------------------------------------------------------------- how many complete sets are in reach
  // N = how many complete sets can be assembled. Outcomes without a pool cap it at what is already held (they
  // cannot be bought); with no such outcome, aim at the largest holding and buy the rest up to it.
  const noPool = snap.pools.filter((p) => !p.exists);
  let n: bigint = noPool.length ? noPool.reduce((m, p) => (holding[p.index] < m ? holding[p.index] : m), holding[noPool[0].index]) : holding.reduce((m, h) => (h > m ? h : m), 0n);
  // --sets caps the tranche: a big fade needs the buy-back money up front (the merge only pays afterwards), so
  // a wallet with little cash unwinds in rounds, each round funding the next. Both routes are then sized to the
  // tranche, so they stay comparable, and whatever is not unwound this round is kept for the next one.
  let tranche = false;
  if (args.sets !== undefined) {
    const cap = BigInt(Math.floor(Number(args.sets) * 1e6)) * 10n ** 12n;
    if (!(cap > 0n)) {
      console.error("--sets must be a positive number of complete sets.");
      process.exit(2);
    }
    if (cap < n) {
      n = cap;
      tranche = true;
    }
  }

  // ---------------------------------------------------------------- route A: sell what has a pool
  interface SellLeg { index: number; amount: bigint; quote: bigint }
  const sells: SellLeg[] = [];
  let sellProceeds = 0n;
  let sellRouteOk = true;
  for (const p of snap.pools) {
    if (!p.exists || holding[p.index] === 0n) continue;
    const amount = tranche && holding[p.index] > n ? n : holding[p.index];
    const q = await quoteExactIn(client, chainId, p.token, snap.collateral, amount, p.fee);
    if (q === 0n) sellRouteOk = false;
    sells.push({ index: p.index, amount, quote: q });
    sellProceeds += q;
  }

  // ---------------------------------------------------------------- route B: complete the sets and merge
  interface BuyLeg { index: number; amount: bigint; quote: bigint }
  const buys: BuyLeg[] = [];
  const leftovers: SellLeg[] = [];
  let buyCost = 0n;
  let leftoverProceeds = 0n;
  let mergeOk = n > 0n;
  if (mergeOk) {
    for (const p of snap.pools) {
      if (!p.exists) continue; // held >= n by construction
      if (holding[p.index] < n) {
        const need = n - holding[p.index];
        const q = await quoteExactOut(client, chainId, snap.collateral, p.token, need, p.fee);
        if (q === 0n) {
          mergeOk = false;
          break;
        }
        buys.push({ index: p.index, amount: need, quote: q });
        buyCost += q;
      } else if (holding[p.index] > n && !tranche) {
        const extra = holding[p.index] - n;
        const q = await quoteExactIn(client, chainId, p.token, snap.collateral, extra, p.fee);
        leftovers.push({ index: p.index, amount: extra, quote: q });
        leftoverProceeds += q;
      }
    }
  }
  // outcome tokens and collateral are both 18-decimal on Seer's wrapped positions: n sets merge into n collateral
  const mergeNet = mergeOk ? n - buyCost + leftoverProceeds : 0n;

  console.log("");
  console.log("ROUTES   (live quotes, " + snap.collateralSymbol + ")");
  console.log("  sell into pools : " + (sells.length ? (sellRouteOk ? "+" + fmt(sellProceeds) : "a pool returns no quote for the full amount") : "nothing sellable (only outcomes without a pool are held)"));
  if (mergeOk) {
    console.log("  buy back + merge: +" + fmt(mergeNet) + "   = merge " + fmt(n) + " sets" + (buyCost > 0n ? " - buy back " + fmt(buyCost) : "") + (leftoverProceeds > 0n ? " + sell leftovers " + fmt(leftoverProceeds) : ""));
    for (const b of buys) console.log("      buy  " + Number(formatUnits(b.amount, 18)).toFixed(4).padStart(10) + " " + snap.outcomes[b.index].slice(0, 44).padEnd(46) + "for " + fmt(b.quote) + "  (" + (Number(formatUnits(b.quote, dec)) / Number(formatUnits(b.amount, 18))).toFixed(4) + " each)");
    for (const l of leftovers) console.log("      sell " + Number(formatUnits(l.amount, 18)).toFixed(4).padStart(10) + " " + snap.outcomes[l.index].slice(0, 44).padEnd(46) + "for " + fmt(l.quote));
  } else {
    console.log("  buy back + merge: not possible" + (n === 0n ? " (an outcome without a pool is not held, so no complete set can be assembled)" : " (a pool cannot deliver the tokens needed)"));
  }

  type Route = "merge" | "sell";
  let route: Route | undefined;
  if (mergeOnly) route = mergeOk ? "merge" : undefined;
  else if (sellOnly) route = sells.length && sellRouteOk ? "sell" : undefined;
  else if (mergeOk && (!sells.length || !sellRouteOk || mergeNet >= sellProceeds)) route = "merge";
  else if (sells.length && sellRouteOk) route = "sell";
  if (!route) {
    console.log("");
    console.log("NO EXIT sends anything worth having. " + (noPool.some((p) => holding[p.index] > 0n) ? "The remaining tokens are outcomes without a pool: they can only be redeemed if that outcome wins, or merged after buying every other leg." : ""));
    process.exit(0);
  }
  const expectedNet = route === "merge" ? mergeNet : sellProceeds;
  console.log("");
  console.log("PLAN     " + (route === "merge" ? "buy back + merge" : "sell into pools") + "  ->  about +" + fmt(expectedNet) + " " + snap.collateralSymbol + "  (worse route: " + (route === "merge" ? (sells.length && sellRouteOk ? "+" + fmt(sellProceeds) : "n/a") : mergeOk ? "+" + fmt(mergeNet) : "n/a") + ")");
  for (const p of snap.pools) {
    const left = route === "merge" ? (p.exists && !tranche ? 0n : holding[p.index] - (holding[p.index] > n ? n : holding[p.index])) : p.exists ? 0n : holding[p.index];
    if (left > 0n) console.log("         stays in the wallet: " + Number(formatUnits(left, 18)).toFixed(4) + " " + snap.outcomes[p.index].slice(0, 50) + (p.exists ? " (kept for the next round)" : " (no pool)"));
  }
  if (tranche) console.log("         this is a tranche of " + fmt(n) + " sets; run the same command again to unwind the next round.");

  // ---------------------------------------------------------------- legs
  interface Leg {
    label: string;
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    approve?: { token: Address; spender: Address; amount: bigint; label: string };
  }
  const legs: Leg[] = [];
  const router = seerRouter(chainId);
  const up = (x: bigint) => (x * BigInt(Math.round((1 + slippageTol) * 10_000))) / 10_000n;
  const down = (x: bigint) => (x * BigInt(Math.round((1 - slippageTol) * 10_000))) / 10_000n;

  if (route === "merge") {
    for (const b of buys) {
      const p = snap.pools[b.index];
      legs.push({
        label: "buy back " + Number(formatUnits(b.amount, 18)).toFixed(2) + " " + snap.outcomes[b.index].slice(0, 30),
        address: dex.router,
        abi: univ3RouterAbi,
        functionName: "exactOutputSingle",
        args: [{ tokenIn: snap.collateral, tokenOut: p.token, fee: p.fee, recipient: "" as Address, amountOut: b.amount, amountInMaximum: up(b.quote), sqrtPriceLimitX96: 0n }],
        approve: { token: snap.collateral, spender: dex.router, amount: up(b.quote), label: snap.collateralSymbol + " -> " + dex.name + " router" },
      });
    }
    // the Seer Router pulls every outcome token of the set, so each needs an allowance for n
    for (const p of snap.pools) {
      legs.push({
        label: "allow " + p.symbol + " for the merge",
        address: p.token,
        abi: erc20FullAbi,
        functionName: "allowance",
        args: [], // marker only: handled through `approve` below, no call of its own
        approve: { token: p.token, spender: router, amount: n, label: p.symbol + " -> Seer Router" },
      });
    }
    legs.push({ label: "merge " + fmt(n) + " complete sets into " + snap.collateralSymbol, address: router, abi: seerRouterAbi, functionName: "mergePositions", args: [snap.collateral, snap.market, n] });
    for (const l of leftovers) {
      const p = snap.pools[l.index];
      legs.push({
        label: "sell leftover " + Number(formatUnits(l.amount, 18)).toFixed(2) + " " + snap.outcomes[l.index].slice(0, 30),
        address: dex.router,
        abi: univ3RouterAbi,
        functionName: "exactInputSingle",
        args: [{ tokenIn: p.token, tokenOut: snap.collateral, fee: p.fee, recipient: "" as Address, amountIn: l.amount, amountOutMinimum: down(l.quote), sqrtPriceLimitX96: 0n }],
        approve: { token: p.token, spender: dex.router, amount: l.amount, label: p.symbol + " -> " + dex.name + " router" },
      });
    }
  } else {
    for (const s of sells) {
      const p = snap.pools[s.index];
      legs.push({
        label: "sell " + Number(formatUnits(s.amount, 18)).toFixed(2) + " " + snap.outcomes[s.index].slice(0, 30),
        address: dex.router,
        abi: univ3RouterAbi,
        functionName: "exactInputSingle",
        args: [{ tokenIn: p.token, tokenOut: snap.collateral, fee: p.fee, recipient: "" as Address, amountIn: s.amount, amountOutMinimum: down(s.quote), sqrtPriceLimitX96: 0n }],
        approve: { token: p.token, spender: dex.router, amount: s.amount, label: p.symbol + " -> " + dex.name + " router" },
      });
    }
  }

  const isMarker = (leg: Leg) => leg.functionName === "allowance";
  const withRecipient = (leg: Leg) => leg.args.map((a) => (typeof a === "object" && a !== null && "recipient" in (a as object) ? { ...(a as Record<string, unknown>), recipient: account } : a));

  console.log("");
  console.log("LEGS     " + legs.filter((l) => !isMarker(l)).length + " transaction(s) plus approvals, reverting past --slippage " + slippageTol);
  if (dryRun) {
    console.log("");
    console.log("DRY RUN - simulating what can be simulated, sending nothing.");
    for (const leg of legs) {
      if (leg.approve) {
        const allowance = await client.readContract({ address: leg.approve.token, abi: erc20FullAbi, functionName: "allowance", args: [account, leg.approve.spender] });
        console.log("  approve  " + leg.approve.label.padEnd(40) + (allowance >= leg.approve.amount ? "already sufficient" : "needed (" + Number(formatUnits(leg.approve.amount, 18)).toFixed(4) + ")"));
      }
      if (isMarker(leg)) continue;
      try {
        await client.simulateContract({ address: leg.address, abi: leg.abi, functionName: leg.functionName, args: withRecipient(leg), account });
        console.log("  simulate " + leg.label.padEnd(40) + "ok");
      } catch (e) {
        console.log("  simulate " + leg.label.padEnd(40) + "not simulatable standalone: " + ((e as Error).message.split("\n")[0]).slice(0, 90));
      }
    }
    console.log("");
    console.log("Dry run complete. Expected to return about +" + fmt(expectedNet) + " " + snap.collateralSymbol + ". Re-run with --yes to send, after a human has approved this plan.");
    process.exit(0);
  }

  const walletClient = signer.walletClient();
  for (const leg of legs) {
    if (leg.approve) {
      const allowance = await client.readContract({ address: leg.approve.token, abi: erc20FullAbi, functionName: "allowance", args: [account, leg.approve.spender] });
      if (allowance < leg.approve.amount) {
        await sendAndWait(walletClient, client, chainId, { address: leg.approve.token, abi: erc20FullAbi, functionName: "approve", args: [leg.approve.spender, leg.approve.amount] }, "approve " + leg.approve.label, (l) => console.log(l));
      }
    }
    if (isMarker(leg)) continue;
    await sendAndWait(walletClient, client, chainId, { address: leg.address, abi: leg.abi, functionName: leg.functionName, args: withRecipient(leg) }, leg.label, (l) => console.log(l));
  }

  const after = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  console.log("");
  console.log("RESULT   " + snap.collateralSymbol + " " + fmt(before) + " -> " + fmt(after) + "   (+" + fmt(after - before) + ", quoted +" + fmt(expectedNet) + ")");
  console.log("POSITION after the unwind:");
  let any = false;
  for (const p of snap.pools) {
    const bal = await client.readContract({ address: p.token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
    if (bal > 0n) {
      any = true;
      console.log("  " + snap.outcomes[p.index].padEnd(56) + Number(formatUnits(bal, 18)).toFixed(4) + (p.exists ? "" : "   (no pool: redeemable only if this outcome wins)"));
    }
  }
  if (!any) console.log("  none");
} finally {
  signer.close();
}
