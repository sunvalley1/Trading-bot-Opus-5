/**
 * `npm run scoreboard -- [--bots <dir>] [--chain 10,100] [--funded 10=900,100=500] [--json]`
 *
 * One line per bot: its cash, what its book would fetch if it sold out today, and the two together against
 * everything the wallet was ever given - its funding plus every redemption it has collected. That last part is
 * why this is not `npm run portfolio` five times: a wallet that collected 356 sUSDS of NU7 winnings starts the
 * round that much ahead, and what it has done since is the only figure worth comparing between models.
 *
 * Everything is read from public artifacts - the wallet from the bot's own pass log, the markets it was told to
 * cover from the prompt it was given, the redemptions from its trade logs - so no .env is opened and no key is
 * touched. Conditional marks come out in parent outcome tokens and are quoted back to the chain's collateral
 * (src/book.ts), without which a Gnosis book cannot be added up at all.
 *
 * Read-only.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits, type Address, type PublicClient } from "viem";
import { parseArgs } from "./args.js";
import { inRootCollateral, symbolOf, valueBook } from "./book.js";
import { getPublicClient } from "./clients.js";
import { EXPECTED_FACTORY_CONFIG, parseChainId, type ChainId } from "./config.js";
import { erc20FullAbi } from "./dex.js";
import { searchSeerMarkets, type SeerMarket } from "./seer-api.js";

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const botsDir = String(args.bots ?? process.env.SCOREBOARD_BOTS ?? path.join(path.dirname(repoRoot), "bots"));
const chains = String(args.chain ?? "10,100")
  .split(",")
  .map((c) => parseChainId(c.trim()));
const funded = new Map<number, number>([
  [10, 900],
  [100, 500],
]);
for (const pair of String(args.funded ?? "").split(",").filter(Boolean)) {
  const [chain, amount] = pair.split("=");
  funded.set(Number(chain), Number(amount));
}

interface Bot {
  name: string;
  dir: string;
  wallet: Address;
}

/**
 * The bots are folders with a pass log; its PASS lines are where each one printed its own wallet. A folder that
 * was renamed leaves the old copy behind holding the same wallet, so only the one that passed most recently is
 * kept: the same wallet twice would otherwise be scored twice, each against a different redemption history.
 */
function findBots(): Bot[] {
  if (!existsSync(botsDir)) {
    console.error("No bots directory at " + botsDir + " (pass --bots <dir>).");
    process.exit(2);
  }
  const byWallet = new Map<string, Bot & { last: number }>();
  for (const name of readdirSync(botsDir)) {
    const dir = path.join(botsDir, name);
    const log = path.join(dir, ".passes", "scheduler.log");
    if (!statSync(dir).isDirectory() || !existsSync(log)) continue;
    const wallets = readFileSync(log, "utf8").match(/wallet (0x[0-9a-fA-F]{40})/g);
    if (!wallets?.length) continue;
    const wallet = wallets[wallets.length - 1].slice(7) as Address;
    const last = statSync(log).mtimeMs;
    const seen = byWallet.get(wallet.toLowerCase());
    if (!seen || seen.last < last) byWallet.set(wallet.toLowerCase(), { name, dir, wallet, last });
  }
  return [...byWallet.values()].map(({ name, dir, wallet }) => ({ name, dir, wallet }));
}

/** The markets a bot was last told to cover on a chain, taken from the prompt its own pass was given. */
function scopeOf(bot: Bot, chainId: ChainId): Set<string> {
  const passes = path.join(bot.dir, ".passes");
  if (!existsSync(passes)) return new Set();
  const dirs = readdirSync(passes)
    .filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d) && (chainId === 10 ? !/-chain\d+$/.test(d) : d.endsWith("-chain" + chainId)))
    .sort()
    .reverse();
  for (const d of dirs) {
    const prompt = path.join(passes, d, "prompt.md");
    if (!existsSync(prompt)) continue;
    const ids = readFileSync(prompt, "utf8")
      .match(/^\s*-\s*`0x[0-9a-f]{40}`/gm)
      ?.map((line) => line.slice(line.indexOf("0x"), line.indexOf("0x") + 42).toLowerCase());
    if (ids?.length) return new Set(ids);
  }
  return new Set();
}

/** Every redemption the bot has collected on a chain, from the run logs `npm run redeem` leaves behind. */
function redeemed(bot: Bot, chainId: ChainId): number {
  const dir = path.join(bot.dir, ".trade-logs");
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const f of readdirSync(dir).filter((name) => /redeem/.test(name) && name.endsWith(".log"))) {
    const text = readFileSync(path.join(dir, f), "utf8");
    const chain = Number(text.match(/--chain (\d+)/)?.[1] ?? 10);
    if (chain !== chainId) continue;
    for (const m of text.matchAll(/^redeemed ([\d.]+) /gm)) total += Number(m[1]);
  }
  return total;
}

interface Row {
  bot: string;
  cash: number;
  book: number;
  total: number;
  given: number;
  delta: number;
  markets: number;
  unpriced: number;
  unpricedNote: string;
}

const bots = findBots();
if (!bots.length) {
  console.error("No bot folders with a pass log under " + botsDir + ".");
  process.exit(2);
}

const byChain = new Map<ChainId, { symbol: string; rows: Row[] }>();
for (const chainId of chains) {
  const client = getPublicClient(chainId, args.rpc as string | undefined) as PublicClient;
  const all = await searchSeerMarkets(/./, { chainId });
  const scopes = new Map(bots.map((b) => [b.name, scopeOf(b, chainId)]));
  const union = new Set([...scopes.values()].flatMap((s) => [...s]));
  const parents = new Set(
    all
      .filter((m) => union.has(m.id.toLowerCase()))
      .map((m) => (m.parentMarket?.id ?? "").toLowerCase())
      .filter((id) => id && !/^0x0{40}$/.test(id)),
  );
  const inView = all.filter((m) => union.has(m.id.toLowerCase()) || parents.has(m.id.toLowerCase()));
  const root = (inView.find((m) => !m.parentMarket || /^0x0{40}$/i.test(m.parentMarket.id))?.collateralToken ?? EXPECTED_FACTORY_CONFIG[chainId]?.collateralToken) as Address | undefined;
  if (!root) {
    console.error("chain " + chainId + ": could not tell what this chain's collateral is (no root market in view).");
    continue;
  }
  const symbol = await symbolOf(client, root);
  console.log("chain " + chainId + ": " + union.size + " market(s) in scope" + (parents.size ? " and " + parents.size + " parent(s)" : "") + ", collateral " + symbol);

  const rows: Row[] = [];
  for (const bot of bots) {
    const mine: SeerMarket[] = inView.filter((m) => scopes.get(bot.name)!.has(m.id.toLowerCase()) || parents.has(m.id.toLowerCase()));
    if (!mine.length) continue;
    const balance = await client
      .readContract({ address: root, abi: erc20FullAbi, functionName: "balanceOf", args: [bot.wallet] })
      .then((b) => b as bigint)
      .catch(() => 0n);
    const cash = Number(formatUnits(balance, 18));
    const book = await valueBook(client, chainId, bot.wallet, mine);
    const valued = await inRootCollateral(client, chainId, mine, root, book, bot.wallet);
    const given = (funded.get(chainId) ?? 0) + redeemed(bot, chainId);
    // parent tokens with no pool and no set to complete: real claims, but nothing can be realised before the parent resolves
    const unpriced = valued.parts.filter((p) => p.value === 0 && p.amount > 0);
    rows.push({
      bot: bot.name,
      cash,
      book: valued.total,
      total: cash + valued.total,
      given,
      delta: cash + valued.total - given,
      markets: book.positions.length,
      unpriced: unpriced.reduce((a, p) => a + p.amount, 0),
      unpricedNote: unpriced.length ? unpriced.map((p) => p.amount.toFixed(2) + " " + p.symbol).join(", ") : "",
    });
  }
  byChain.set(chainId, { symbol, rows });
}

if (args.json) {
  console.log(JSON.stringify(Object.fromEntries(byChain), null, 2));
} else {
  const totals = new Map<string, number>();
  for (const [chainId, { symbol, rows }] of byChain) {
    console.log("");
    console.log("CHAIN " + chainId + "  (" + symbol + ")");
    console.log("  " + "bot".padEnd(14) + "cash".padStart(10) + "book".padStart(10) + "total".padStart(11) + "given".padStart(11) + "P&L".padStart(10) + "   markets   not counted");
    for (const r of [...rows].sort((a, b) => b.delta - a.delta)) {
      console.log(
        "  " +
          r.bot.padEnd(14) +
          r.cash.toFixed(2).padStart(10) +
          r.book.toFixed(2).padStart(10) +
          r.total.toFixed(2).padStart(11) +
          r.given.toFixed(2).padStart(11) +
          ((r.delta >= 0 ? "+" : "") + r.delta.toFixed(2)).padStart(10) +
          "   " +
          String(r.markets).padStart(7) +
          (r.unpriced ? "   " + r.unpriced.toFixed(2) + " in parent tokens with no pool and no set to complete" : ""),
      );
      totals.set(r.bot, (totals.get(r.bot) ?? 0) + r.delta);
      if (r.unpricedNote) console.log("  " + "".padEnd(14) + "(" + r.unpricedNote + ": each pays only if its own outcome wins, so none of it is counted above)");
    }
  }
  if (byChain.size > 1) {
    console.log("");
    console.log("BOTH CHAINS  (1 sUSDS counted as 1 sDAI)");
    for (const [bot, delta] of [...totals].sort((a, b) => b[1] - a[1])) console.log("  " + bot.padEnd(14) + ((delta >= 0 ? "+" : "") + delta.toFixed(2)).padStart(10));
  }
  console.log("");
  console.log("given = funding (" + [...funded].map(([c, f]) => f + " on chain " + c).join(", ") + ") plus every redemption the wallet has collected, so P&L is what the model itself has done.");
}
