/**
 * `npm run trade -- <market> --outcome 1 --route split --size 10 [--dry-run | --yes]`
 *
 * The only command here that moves money. It executes ONE planned trade on ONE market:
 *   --route direct : swap `--size` collateral into the outcome's own pool.
 *   --route split  : mint `--size` complete sets from collateral, then sell every other outcome that has a
 *                    pool, leaving `--size` tokens of the target (and of anything unsellable, e.g. Invalid).
 *
 * Who signs: the same rule as the rest of this repository. LIQUIDITY_SIGNER=metamask (the default) means the
 * human confirms every single transaction in their own wallet - this tool builds, simulates and submits, it
 * never holds the keys to a trading wallet. Start `npm run signer` once per session first.
 *
 * Safety: every leg is simulated before it is sent, `amountOutMinimum` is derived from a live quote and the
 * `--slippage` tolerance (so a sandwiched or moved pool reverts instead of filling badly), and nothing is
 * sent at all without `--yes`.
 */
import { formatUnits, getAddress, isAddress, isAddressEqual, parseUnits, type Abi, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient, resolveSigner } from "./clients.js";
import { CHAIN_NAMES, parseChainId, type ChainId } from "./config.js";
import { erc20FullAbi, getDex, quoteExactIn, seerRouterAbi, univ3RouterAbi } from "./dex.js";
import { fetchSeerMarket, marketUrl, parseMarketRef } from "./seer-api.js";
import { seerRouter, snapshot } from "./trade.js";
import { sendAndWait } from "./tx.js";

const args = parseArgs(process.argv.slice(2));
const ref = args._[0];
const outcomeArg = args.outcome as string | undefined;
const route = String(args.route ?? "direct");
const sizeArg = args.size as string | undefined;
const dryRun = !!args["dry-run"];
const yes = !!args.yes;
const slippageTol = Number(args.slippage ?? 0.02); // how far below the quote the fill may land before reverting

if (!ref || outcomeArg === undefined || !sizeArg || (route !== "direct" && route !== "split" && route !== "fade")) {
  console.error("usage: npm run trade -- <market> --outcome <index> --route direct|split|fade --size <amount> [--expect-account 0x..] [--allow-add] [--slippage 0.02] [--dry-run | --yes]");
  console.error("       direct: --size is collateral spent.");
  console.error("       split : --size is complete sets to mint; every OTHER outcome is sold, you keep --outcome.");
  console.error("       fade  : --size is complete sets to mint; ONLY --outcome is sold, you keep all the others");
  console.error("               (a short position on --outcome: it pays unless that outcome wins).");
  process.exit(2);
}
if (!dryRun && !yes) {
  console.error("Refusing to send without --yes. Run with --dry-run first and have a human approve the result.");
  process.exit(2);
}

const parsed = parseMarketRef(ref);
const chainId = parseChainId((args.chain as string | undefined) ?? parsed.chainId);
// app.seer.pm is only needed to turn a slug into an address and to print a link. When the ref is already an
// address, everything that decides money comes from the chain - so a slow or down website must not be able to
// stop a trade, or to stop one being unwound.
let api: Awaited<ReturnType<typeof fetchSeerMarket>>;
try {
  api = await fetchSeerMarket(chainId, parsed.idOrSlug);
} catch (e) {
  api = undefined;
  console.log("(app.seer.pm is unreachable - continuing from the chain alone, which is where every number that matters comes from)");
}
if (!api && !isAddress(parsed.idOrSlug, { strict: false })) {
  console.error("No market found for \"" + parsed.idOrSlug + "\" on chain " + chainId + ", and it is not an address.");
  console.error("Pass the market address directly so this can run without app.seer.pm.");
  process.exit(1);
}
const marketAddress = (api?.id ?? getAddress(parsed.idOrSlug)) as Address;

const client = getPublicClient(chainId, args.rpc as string | undefined);
const snap = await snapshot(client, chainId, marketAddress);
const dex = getDex(chainId);
const target = Number(outcomeArg);
if (!Number.isInteger(target) || target < 0 || target >= snap.outcomes.length) {
  console.error("--outcome must be one of:");
  snap.outcomes.forEach((o, i) => console.error("  " + i + "  " + o));
  process.exit(2);
}
if (snap.payoutReported) {
  console.error("This market is already resolved (payout reported). Nothing to trade.");
  process.exit(1);
}

const size = parseUnits(sizeArg, snap.collateralDecimals);

console.log("MARKET   " + snap.name);
console.log("         " + (api ? marketUrl(api) : "https://app.seer.pm/markets/" + chainId + "/" + marketAddress));
console.log("ROUTE    " + route + "   target outcome [" + target + "] " + snap.outcomes[target]);
console.log("SIZE     " + formatUnits(size, snap.collateralDecimals) + (route === "direct" ? " " + snap.collateralSymbol + " spent" : " complete sets minted"));
console.log("");

// ---------------------------------------------------------------- build the legs

interface Leg {
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** token + spender + amount this leg needs approved beforehand */
  approve?: { token: Address; spender: Address; amount: bigint; label: string };
}

const legs: Leg[] = [];
const router = seerRouter(chainId);

if (route === "direct") {
  const pool = snap.pools[target];
  if (!pool.exists) {
    console.error("Outcome [" + target + "] has no pool on " + dex.name + ": it cannot be bought directly. Use --route split.");
    process.exit(1);
  }
  const quoted = await quoteExactIn(client, chainId, snap.collateral, pool.token, size, pool.fee);
  if (quoted <= 0n) {
    console.error("The pool returns no quote for this size. Try a smaller --size.");
    process.exit(1);
  }
  const minOut = (quoted * BigInt(Math.round((1 - slippageTol) * 10_000))) / 10_000n;
  const avg = Number(formatUnits(size, snap.collateralDecimals)) / Number(formatUnits(quoted, 18));
  console.log("QUOTE    " + formatUnits(size, snap.collateralDecimals) + " " + snap.collateralSymbol + " -> " + Number(formatUnits(quoted, 18)).toFixed(4) + " " + pool.symbol);
  console.log("         average fill " + avg.toFixed(4) + " vs spot " + (pool.price ?? 0).toFixed(4) + "  (" + (((avg / (pool.price ?? avg)) - 1) * 100).toFixed(1) + "% slippage)");
  console.log("         reverts below " + Number(formatUnits(minOut, 18)).toFixed(4) + " tokens (--slippage " + slippageTol + ")");
  legs.push({
    label: "buy " + snap.outcomes[target],
    address: dex.router,
    abi: univ3RouterAbi,
    functionName: "exactInputSingle",
    args: [{ tokenIn: snap.collateral, tokenOut: pool.token, fee: pool.fee, recipient: "" as Address, amountIn: size, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
    approve: { token: snap.collateral, spender: dex.router, amount: size, label: snap.collateralSymbol + " -> " + dex.name + " router" },
  });
} else {
  legs.push({
    label: "split " + formatUnits(size, snap.collateralDecimals) + " " + snap.collateralSymbol + " into complete sets",
    address: router,
    abi: seerRouterAbi,
    functionName: "splitPosition",
    args: [snap.collateral, snap.market, size],
    approve: { token: snap.collateral, spender: router, amount: size, label: snap.collateralSymbol + " -> Seer Router" },
  });
  let proceeds = 0n;
  const kept: string[] = route === "fade" ? [] : [snap.outcomes[target]];
  for (const pool of snap.pools) {
    // split: sell everything except the target. fade: sell ONLY the target.
    const sellThis = route === "fade" ? pool.index === target : pool.index !== target;
    if (!sellThis) {
      if (pool.index !== target || route === "fade") kept.push(snap.outcomes[pool.index]);
      continue;
    }
    if (!pool.exists) {
      kept.push(snap.outcomes[pool.index] + " (no pool)");
      continue;
    }
    const quoted = await quoteExactIn(client, chainId, pool.token, snap.collateral, size, pool.fee);
    if (quoted <= 0n) {
      kept.push(snap.outcomes[pool.index] + " (no quote)");
      continue;
    }
    proceeds += quoted;
    const minOut = (quoted * BigInt(Math.round((1 - slippageTol) * 10_000))) / 10_000n;
    console.log("  sell " + Number(formatUnits(size, 18)).toFixed(4) + " " + pool.symbol.padEnd(12) + " -> " + Number(formatUnits(quoted, snap.collateralDecimals)).toFixed(4) + " " + snap.collateralSymbol + "  (" + (Number(formatUnits(quoted, 18)) / Number(formatUnits(size, 18))).toFixed(4) + " each, spot " + (pool.price ?? 0).toFixed(4) + ")");
    legs.push({
      label: "sell " + snap.outcomes[pool.index],
      address: dex.router,
      abi: univ3RouterAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn: pool.token, tokenOut: snap.collateral, fee: pool.fee, recipient: "" as Address, amountIn: size, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
      approve: { token: pool.token, spender: dex.router, amount: size, label: pool.symbol + " -> " + dex.name + " router" },
    });
  }
  const net = size - proceeds;
  const avg = Number(formatUnits(net, snap.collateralDecimals)) / Number(formatUnits(size, 18));
  console.log("");
  console.log("QUOTE    net cost " + Number(formatUnits(net, snap.collateralDecimals)).toFixed(4) + " " + snap.collateralSymbol + " for " + Number(formatUnits(size, 18)).toFixed(4) + " tokens");
  // Compare against what the bundle we KEEP costs at spot. For a fade that is every outcome except the one sold;
  // quoting the sold outcome's own price here would make a fair fill look like a 90% discount.
  const bundleSpot = snap.pools
    .filter((pl) => (route === "fade" ? pl.index !== target : pl.index === target))
    .reduce((a, pl) => a + (snap.spot[pl.index] ?? 0), 0);
  console.log("         average fill " + avg.toFixed(4) + " vs " + bundleSpot.toFixed(4) + " for the same bundle at spot  (" + (bundleSpot > 0 ? ((avg / bundleSpot - 1) * 100).toFixed(1) + "% slippage" : "no spot reference") + ")");
  console.log("         position pays out if: " + kept.join(" or "));
}

console.log("");
console.log("LEGS     " + legs.length + " transaction(s) plus approvals");

// ---------------------------------------------------------------- send

const signer = await resolveSigner(chainId, { signer: args.signer as string | undefined, rpc: args.rpc as string | undefined, account: args.account as string | undefined, dryRun, noBatch: !!args["no-batch"] });
try {
  const account = signer.address;
  console.log("SIGNER   " + signer.mode + "  " + account);

  // Wrong-wallet guard. A browser wallet connects whichever account happens to be selected, and that is not
  // always the one the plan was sized for. --expect-account makes the intended address explicit and aborts
  // on a mismatch, before any approval or swap is built.
  const expected = args["expect-account"] as string | undefined;
  if (expected) {
    if (!isAddress(expected, { strict: false })) {
      console.error("--expect-account is not a valid address: " + expected);
      process.exit(2);
    }
    if (!isAddressEqual(expected as Address, account)) {
      console.error("");
      console.error("WRONG WALLET. Refusing to trade.");
      console.error("  expected (--expect-account): " + getAddress(expected));
      console.error("  actually connected         : " + getAddress(account));
      console.error("Switch the account in your wallet extension, then run this again.");
      process.exit(1);
    }
    console.log("         wallet matches --expect-account");
  }

  // Chain guard. A browser wallet is connected to whatever network the user last selected, which is not
  // necessarily the one this market lives on. Without this the run gets as far as building real calldata
  // before failing, and on a wallet that silently auto-switches it could target the wrong chain entirely.
  if (!dryRun) {
    const walletChain = await signer.walletClient().getChainId().catch(() => undefined);
    if (walletChain !== undefined && walletChain !== Number(chainId)) {
      console.error("");
      console.error("WRONG NETWORK. Refusing to trade.");
      console.error("  this market is on : chain " + chainId + " (" + CHAIN_NAMES[chainId] + ")");
      console.error("  your wallet is on : chain " + walletChain + (CHAIN_NAMES[walletChain as ChainId] ? " (" + CHAIN_NAMES[walletChain as ChainId] + ")" : ""));
      console.error("Switch the network in your wallet extension, then run this again.");
      process.exit(1);
    }
    if (walletChain !== undefined) console.log("         wallet is on the right chain (" + CHAIN_NAMES[chainId] + ")");
  }
  console.log("");

  // balance check before anything else
  const balance = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  const needed = route === "direct" ? size : size;
  console.log("BALANCE  " + Number(formatUnits(balance, snap.collateralDecimals)).toFixed(4) + " " + snap.collateralSymbol + "   needed " + Number(formatUnits(needed, snap.collateralDecimals)).toFixed(4));
  if (balance < needed) {
    console.error("Not enough " + snap.collateralSymbol + " in " + account + ". Fund it or lower --size.");
    process.exit(1);
  }

  // Duplicate-position guard. Re-running an identical command is not idempotent: it places the trade AGAIN,
  // at a worse fill, because the first one already moved the pool. This happened for real - an accidental
  // second run doubled a position and turned +$14 of expected value into roughly zero. Holding any of the
  // outcomes this trade would leave us holding means a position is already open here.
  const alreadyHeld: string[] = [];
  for (const pool of snap.pools) {
    const isRetained = route === "fade" ? pool.index !== target : pool.index === target || !pool.exists;
    if (!isRetained) continue;
    const bal = await client.readContract({ address: pool.token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
    if (bal > 0n) alreadyHeld.push(snap.outcomes[pool.index] + ": " + Number(formatUnits(bal, 18)).toFixed(2));
  }
  if (alreadyHeld.length) {
    console.log("");
    console.log("ALREADY HOLDING a position on this market:");
    for (const h of alreadyHeld) console.log("    " + h);
    if (!args["allow-add"]) {
      console.error("");
      console.error("Refusing to trade: this would ADD to an existing position, not replace it, and the second");
      console.error("fill is always worse because the first one moved the pool. If adding is what you intend,");
      console.error("re-run with --allow-add. If this was a repeated command, you are already done.");
      process.exit(1);
    }
    console.log("    --allow-add given: adding to the position on purpose.");
  }

  if (dryRun) {
    console.log("");
    console.log("DRY RUN - simulating every leg, sending nothing.");
    for (const leg of legs) {
      const callArgs = leg.args.map((a) => (typeof a === "object" && a !== null && "recipient" in (a as object) ? { ...(a as Record<string, unknown>), recipient: account } : a));
      if (leg.approve) {
        const allowance = await client.readContract({ address: leg.approve.token, abi: erc20FullAbi, functionName: "allowance", args: [account, leg.approve.spender] });
        console.log("  approve  " + leg.approve.label.padEnd(40) + (allowance >= leg.approve.amount ? "already sufficient" : "needed (" + Number(formatUnits(leg.approve.amount, 18)).toFixed(4) + ")"));
      }
      try {
        await client.simulateContract({ address: leg.address, abi: leg.abi, functionName: leg.functionName, args: callArgs, account });
        console.log("  simulate " + leg.label.padEnd(40) + "ok");
      } catch (e) {
        // a leg that depends on a previous leg's output cannot simulate standalone (the tokens do not exist yet)
        const msg = (e as Error).message.split("\n")[0];
        console.log("  simulate " + leg.label.padEnd(40) + "not simulatable standalone: " + msg.slice(0, 90));
      }
    }
    console.log("");
    console.log("Dry run complete. Re-run with --yes to send, after a human has approved this plan.");
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
    const callArgs = leg.args.map((a) => (typeof a === "object" && a !== null && "recipient" in (a as object) ? { ...(a as Record<string, unknown>), recipient: account } : a));
    await sendAndWait(walletClient, client, chainId, { address: leg.address, abi: leg.abi, functionName: leg.functionName, args: callArgs }, leg.label, (l) => console.log(l));
  }

  console.log("");
  console.log("POSITION after the trade:");
  for (const pool of snap.pools) {
    const bal = await client.readContract({ address: pool.token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
    if (bal > 0n) console.log("  " + snap.outcomes[pool.index].padEnd(56) + Number(formatUnits(bal, 18)).toFixed(4) + " " + pool.symbol);
  }
  const after = await client.readContract({ address: snap.collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [account] });
  console.log("  " + snap.collateralSymbol.padEnd(56) + Number(formatUnits(after, snap.collateralDecimals)).toFixed(4) + "   (was " + Number(formatUnits(balance, snap.collateralDecimals)).toFixed(4) + ")");
  console.log("");
  console.log("Redeem after the oracle finalizes:  npm run redeem -- " + marketAddress + " --chain " + chainId);
} finally {
  signer.close();
}

