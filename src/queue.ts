/**
 * `npm run queue -- add <market> --outcome <i> --route <direct|split|fade> --size <x> [--chain 100] [--allow-add] [--note "..."]`
 * `npm run queue -- list`
 * `npm run queue -- execute [--dry-run | --yes] [--chain 100] [--max-age-min 150] [--max 25]`
 * `npm run queue -- redeem [--dry-run | --yes] [--chain 100]`
 *
 * The hand-off between a bot's pass and the money. A pass (an AI agent running the skill unattended) records
 * every trade it decided on with `add`; it never runs `npm run trade --yes` itself. `execute` is a plain script
 * with no model in it: it takes the pending items oldest first and runs `npm run trade` for each, one at a
 * time, with this folder's wallet as `--expect-account`, then files the result. Items older than --max-age-min
 * are discarded unexecuted, because a quote on these pools is fiction after an hour or two.
 *
 * Unattended execution (`execute --yes`) needs key signing: LIQUIDITY_SIGNER=key and this wallet's PRIVATE_KEY
 * in .env, both placed there by the human who chose to run the experiment that way. With a browser wallet, the
 * executor prints the commands and the human runs them.
 *
 * Chains: an item remembers the chain its market is on, and the executor passes it on to `npm run trade`. The
 * chain is --chain when given, else the one in an app.seer.pm link, else the chain whose scope list names the
 * market, else the folder's CHAIN_ID. `execute --chain <id>` runs only that chain's items.
 *
 * Redemption: after the trades, `execute` cashes in every resolved market on its chain that the wallet still holds
 * winning tokens in (redeem-sweep.ts finds them, `npm run redeem` sends), and files each one like a trade. It needs
 * no decision, so it also runs on its own (`redeem`) when a pass's model step fails, and a redemption that fails
 * is simply found again on the next run.
 *
 * Files (both ignored by git): .queue/pending.jsonl and .queue/executed.jsonl, one JSON object per line.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { parseChainId } from "./config.js";
import { findRedeemable } from "./redeem-sweep.js";
import { parseMarketRef } from "./seer-api.js";
import "dotenv/config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, ".queue");
const PENDING = path.join(DIR, "pending.jsonl");
const EXECUTED = path.join(DIR, "executed.jsonl");

interface Item {
  id: string;
  createdAt: string;
  model?: string;
  wallet?: string;
  chain: number;
  /**
   * "trade" (the default) runs `npm run trade`; "unwind" runs `npm run unwind` to exit the market's position;
   * "redeem" is never queued, only filed: the executor's sweep cashing in a resolved market
   */
  kind?: "trade" | "unwind" | "redeem";
  market: string;
  outcome: number;
  route: "direct" | "split" | "fade";
  size: string;
  allowAdd: boolean;
  /** unwind only: cap the round at this many complete sets */
  sets?: string;
  note?: string;
}
interface Executed extends Item {
  executedAt: string;
  status: "done" | "failed" | "stale" | "dry-run" | "unverified";
  exitCode?: number;
  log?: string;
  reason?: string;
}

const readItems = <T>(file: string): T[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as T)
    : [];
const writeItems = (file: string, items: unknown[]) => writeFileSync(file, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
const appendItem = (file: string, item: unknown) => appendFileSync(file, JSON.stringify(item) + "\n");

mkdirSync(DIR, { recursive: true });
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const defaultChain = Number(process.env.CHAIN_ID ?? 10);
const wallet = process.env.LIQUIDITY_WALLET;
const model = process.env.MODEL_NAME;

// The experiment trades a fixed list of markets on each chain (MODELS.md): PASS_MARKET_LIST_<chain>, and for the
// folder's own chain (CHAIN_ID) plain PASS_MARKET_LIST too. Once any list is set, a trade on anything else - or
// on a chain with no list - is refused here, at the queue, so no pass can widen the scope by accident.
const scopeVar = (chain: number) => (process.env["PASS_MARKET_LIST_" + chain] !== undefined || chain !== defaultChain ? "PASS_MARKET_LIST_" + chain : "PASS_MARKET_LIST");
const scopeList = (chain: number) => (process.env[scopeVar(chain)] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const scoped = Object.keys(process.env).some((k) => /^PASS_MARKET_LIST(_\d+)?$/.test(k) && (process.env[k] ?? "").trim() !== "");
const listedChains = Object.keys(process.env).map((k) => k.match(/^PASS_MARKET_LIST_(\d+)$/)?.[1]).filter((c): c is string => !!c).map(Number);

function chainFor(market: string): number {
  if (args.chain !== undefined) return Number(args.chain);
  const fromLink = parseMarketRef(market).chainId;
  if (fromLink) return Number(fromLink);
  const m = market.toLowerCase();
  const listing = listedChains.filter((c) => scopeList(c).some((a) => m.includes(a)));
  return listing.length === 1 ? listing[0] : defaultChain;
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Cashes in every resolved market on `chain` in which the wallet still holds tokens that pay something, one
 * `npm run redeem` each, filed in executed.jsonl. A resolved market pays what it pays: there is nothing for a
 * model to decide, so this runs whether or not a pass queued anything.
 */
async function redeemSweep(chain: number, dryRun: boolean): Promise<void> {
  const account = getAddress(wallet!);
  const chainId = parseChainId(chain);
  let sweep: Awaited<ReturnType<typeof findRedeemable>>;
  try {
    sweep = await findRedeemable(getPublicClient(chainId), chainId, account);
  } catch (e) {
    console.log("");
    console.log("REDEEM   could not list the resolved markets on chain " + chain + ": " + (e as Error).message.split("\n")[0] + " (the next run tries again)");
    return;
  }
  console.log("");
  console.log("REDEEM   chain " + chain + ": " + sweep.found.length + " resolved market(s) with something to collect" + (sweep.worthless.length ? "; " + sweep.worthless.length + " hold only losing tokens and are left alone" : "") + (dryRun ? "  (dry run)" : ""));
  for (const r of sweep.found) {
    const redeemArgs = ["run", "redeem", "--", r.market, "--chain", String(chain), "--expect-account", account, ...(dryRun ? ["--account", account, "--dry-run"] : ["--yes"])];
    console.log("  running  npm " + redeemArgs.join(" ") + "   (about " + r.expected.toFixed(4) + " to collect: " + r.name.slice(0, 60) + ")");
    const res = spawnSync(npmCmd, redeemArgs, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: process.env, timeout: 15 * 60_000 });
    const out = (res.stdout ?? "") + (res.stderr ?? "");
    process.stdout.write(out.split("\n").map((l) => "    | " + l).join("\n") + "\n");
    if (dryRun) continue;
    const unverified = out.match(/Transaction (0x[0-9a-fA-F]{64}) was submitted, but its receipt could not be verified/);
    const now = new Date().toISOString();
    const result: Executed = {
      id: now.replace(/[:.]/g, "-") + "-redeem",
      createdAt: now,
      model,
      wallet: account,
      chain,
      kind: "redeem",
      market: r.market,
      outcome: -1,
      route: "direct",
      size: "0",
      allowAdd: false,
      note: r.name.slice(0, 100) + ": about " + r.expected.toFixed(4) + " to collect",
      executedAt: now,
      status: res.status === 0 ? "done" : unverified ? "unverified" : "failed",
      exitCode: res.status ?? undefined,
      log: out.match(/^LOG\s+(.+)$/m)?.[1]?.trim(),
    };
    if (unverified) result.reason = "transaction " + unverified[1] + " was SENT but its receipt could not be read; the next run sees whether the tokens are gone";
    else if (res.status !== 0) result.reason = "redeem exited " + res.status + (res.error ? ": " + res.error.message : "") + "; the next run tries again";
    appendItem(EXECUTED, result);
    if (result.status !== "done") console.log("  " + result.status.toUpperCase() + "  " + r.market + "  " + (result.reason ?? ""));
  }
}

function requireInScope(market: string, chain: number) {
  if (!scoped) return;
  const m = market.toLowerCase();
  if (scopeList(chain).some((a) => m.includes(a))) return;
  console.error("OUT OF SCOPE: " + market + " is not one of the markets this experiment trades on chain " + chain + " (" + scopeVar(chain) + " in .env, listed in MODELS.md). Refusing to queue it.");
  process.exit(1);
}

if (cmd === "add") {
  const market = args._[1];
  const outcome = Number(args.outcome);
  const route = String(args.route ?? "");
  const size = String(args.size ?? "");
  if (!market || !Number.isInteger(outcome) || outcome < 0 || !["direct", "split", "fade"].includes(route) || !(Number(size) > 0)) {
    console.error('usage: npm run queue -- add <market address|slug|url> --outcome <i> --route <direct|split|fade> --size <x> [--allow-add] [--note "..."]');
    process.exit(2);
  }
  const chain = chainFor(market);
  requireInScope(market, chain);
  const item: Item = {
    id: new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(16).slice(2, 8),
    createdAt: new Date().toISOString(),
    model,
    wallet: wallet && isAddress(wallet, { strict: false }) ? getAddress(wallet) : undefined,
    chain,
    market,
    outcome,
    route: route as Item["route"],
    size,
    allowAdd: !!args["allow-add"],
    note: typeof args.note === "string" ? args.note : undefined,
  };
  appendItem(PENDING, item);
  console.log("queued " + item.id + ": " + route + " outcome " + outcome + " size " + size + " on " + market + " (chain " + chain + ")" + (item.allowAdd ? "  (--allow-add)" : ""));
  console.log("It is executed by `npm run queue -- execute --yes` (key mode) or by a human running the printed trade command.");
  process.exit(0);
}

if (cmd === "add-unwind") {
  const market = args._[1];
  if (!market) {
    console.error('usage: npm run queue -- add-unwind <market address|slug|url> [--sets <n>] [--note "..."]');
    process.exit(2);
  }
  const chain = chainFor(market);
  requireInScope(market, chain);
  const item: Item = {
    id: new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(16).slice(2, 8),
    createdAt: new Date().toISOString(),
    model,
    wallet: wallet && isAddress(wallet, { strict: false }) ? getAddress(wallet) : undefined,
    chain,
    kind: "unwind",
    market,
    outcome: -1,
    route: "direct",
    size: "0",
    allowAdd: false,
    sets: typeof args.sets === "string" ? args.sets : undefined,
    note: typeof args.note === "string" ? args.note : undefined,
  };
  appendItem(PENDING, item);
  console.log("queued " + item.id + ": unwind the position on " + market + " (chain " + chain + ")" + (item.sets ? " in rounds of " + item.sets + " sets" : ""));
  process.exit(0);
}

if (cmd === "list" || cmd === undefined) {
  const pending = readItems<Item>(PENDING);
  const executed = readItems<Executed>(EXECUTED);
  console.log("QUEUE  " + (model ?? "(no MODEL_NAME)") + "  wallet " + (wallet ?? "(unset)") + "  home chain " + defaultChain);
  console.log("");
  console.log("pending (" + pending.length + ")");
  const describe = (p: Item) =>
    "c" + p.chain + "  " +
    (p.kind === "redeem"
      ? "redeem  " + p.market
      : p.kind === "unwind"
        ? "unwind" + (p.sets ? " (rounds of " + p.sets + ")" : "") + "  " + p.market
        : p.route.padEnd(6) + " outcome " + p.outcome + "  size " + String(p.size).padStart(8) + "  " + p.market + (p.allowAdd ? "  --allow-add" : ""));
  for (const p of pending) console.log("  " + p.id + "  " + describe(p) + (p.note ? "   # " + p.note : ""));
  console.log("");
  console.log("executed, last 10 of " + executed.length);
  for (const e of executed.slice(-10)) console.log("  " + e.executedAt + "  " + e.status.padEnd(7) + " " + describe(e) + (e.log ? "   " + e.log : "") + (e.reason ? "   " + e.reason : ""));
  process.exit(0);
}

if (cmd === "execute") {
  const dryRun = !!args["dry-run"];
  const yes = !!args.yes;
  if (!dryRun && !yes) {
    console.error("execute needs --dry-run or --yes.");
    process.exit(2);
  }
  const maxAgeMin = Number(args["max-age-min"] ?? 150);
  const max = Number(args.max ?? 25);
  if (!wallet || !isAddress(wallet, { strict: false })) {
    console.error("LIQUIDITY_WALLET is not set in .env: the executor refuses to guess which wallet it is trading.");
    process.exit(2);
  }
  if (yes && ((process.env.LIQUIDITY_SIGNER || "").toLowerCase() !== "key" || !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || ""))) {
    console.error("Unattended execution needs key signing: set LIQUIDITY_SIGNER=key and this wallet's PRIVATE_KEY in .env.");
    console.error("With a browser wallet, run the commands below yourself (each once) and confirm in the wallet:");
    for (const p of readItems<Item>(PENDING)) console.error("  " + (p.kind === "unwind" ? "npm run unwind -- " + p.market + " --chain " + p.chain + (p.sets ? " --sets " + p.sets : "") : "npm run trade -- " + p.market + " --chain " + p.chain + " --outcome " + p.outcome + " --route " + p.route + " --size " + p.size + (p.allowAdd ? " --allow-add" : "")) + " --expect-account " + getAddress(wallet) + " --yes");
    process.exit(2);
  }
  let pending = readItems<Item>(PENDING);
  // --chain: only that chain's items, so a pass on one chain carries out its own decisions and nothing else
  const onlyChain = args.chain !== undefined ? Number(args.chain) : undefined;
  const todo = pending.filter((p) => onlyChain === undefined || Number(p.chain) === onlyChain);
  if (!todo.length) console.log("nothing queued" + (onlyChain !== undefined ? " on chain " + onlyChain : "") + ".");
  else console.log("EXECUTE  " + (model ?? "") + "  wallet " + getAddress(wallet) + "  " + todo.length + " pending" + (onlyChain !== undefined ? " on chain " + onlyChain : "") + "  " + (dryRun ? "(dry run: every trade with --dry-run, nothing sent)" : "(LIVE: --yes)"));
  let ran = 0;
  for (const item of todo) {
    if (ran >= max) break;
    const ageMin = (Date.now() - Date.parse(item.createdAt)) / 60_000;
    // a dry run passes --account so the trade command plans without opening a signer tab
    const tradeArgs =
      item.kind === "unwind"
        ? ["run", "unwind", "--", item.market, "--chain", String(item.chain), ...(item.sets ? ["--sets", item.sets] : []), "--expect-account", getAddress(wallet), ...(dryRun ? ["--account", getAddress(wallet), "--dry-run"] : ["--yes"])]
        : ["run", "trade", "--", item.market, "--chain", String(item.chain), "--outcome", String(item.outcome), "--route", item.route, "--size", item.size, "--expect-account", getAddress(wallet), ...(item.allowAdd ? ["--allow-add"] : []), ...(dryRun ? ["--account", getAddress(wallet), "--dry-run"] : ["--yes"])];
    let result: Executed;
    if (ageMin > maxAgeMin) {
      result = { ...item, executedAt: new Date().toISOString(), status: "stale", reason: "queued " + ageMin.toFixed(0) + " min ago, older than --max-age-min " + maxAgeMin + ": its quote is fiction now, re-plan instead" };
      console.log("  stale    " + item.id + "  " + result.reason);
    } else {
      console.log("");
      console.log("  running  npm " + tradeArgs.join(" "));
      const r = spawnSync(npmCmd, tradeArgs, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: process.env, timeout: 15 * 60_000 });
      const out = (r.stdout ?? "") + (r.stderr ?? "");
      const logMatch = out.match(/^LOG\s+(.+)$/m);
      process.stdout.write(out.split("\n").map((l) => "    | " + l).join("\n") + "\n");
      // A trade that sent a transaction but could not read its receipt is NOT a failure: the transaction may well
      // have executed (one did, while the public RPC was refusing reads). Record it as unverified with the hash,
      // so nobody reads "failed" and trades again; the next pass sees the real position through `portfolio`.
      const unverified = out.match(/Transaction (0x[0-9a-fA-F]{64}) was submitted, but its receipt could not be verified/);
      result = { ...item, executedAt: new Date().toISOString(), status: dryRun ? "dry-run" : r.status === 0 ? "done" : unverified ? "unverified" : "failed", exitCode: r.status ?? undefined, log: logMatch?.[1]?.trim() };
      if (unverified) result.reason = "transaction " + unverified[1] + " was SENT but its receipt could not be read (RPC refused); it may have executed. Verify the hash and the wallet's position before assuming anything.";
      else if (r.status !== 0) result.reason = "trade exited " + r.status + (r.error ? ": " + r.error.message : "");
      ran++;
    }
    if (!dryRun || result.status === "stale") {
      // a live run or a stale item leaves the queue; a dry run keeps it so the human can still execute it
      pending = pending.filter((p) => p.id !== item.id);
      writeItems(PENDING, pending);
      appendItem(EXECUTED, result);
    }
    if (result.status === "failed") console.log("  FAILED   " + item.id + "  " + result.reason + "  (see " + (result.log ?? "the output above") + ")");
  }
  await redeemSweep(onlyChain ?? defaultChain, dryRun);
  console.log("");
  console.log("done. " + pending.length + " still pending. `npm run queue -- list` shows the record; `npm run portfolio -- --account " + getAddress(wallet) + (onlyChain !== undefined && onlyChain !== defaultChain ? " --chain " + onlyChain + " --scope" : "") + "` shows the book.");
  process.exit(0);
}

if (cmd === "redeem") {
  const dryRun = !!args["dry-run"];
  const yes = !!args.yes;
  if (!dryRun && !yes) {
    console.error("redeem needs --dry-run or --yes.");
    process.exit(2);
  }
  if (!wallet || !isAddress(wallet, { strict: false })) {
    console.error("LIQUIDITY_WALLET is not set in .env: the executor refuses to guess which wallet it is redeeming for.");
    process.exit(2);
  }
  if (yes && ((process.env.LIQUIDITY_SIGNER || "").toLowerCase() !== "key" || !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || ""))) {
    console.error("Unattended redemption needs key signing: set LIQUIDITY_SIGNER=key and this wallet's PRIVATE_KEY in .env, or run `npm run redeem -- <market> --yes` yourself.");
    process.exit(2);
  }
  await redeemSweep(args.chain !== undefined ? Number(args.chain) : defaultChain, dryRun);
  process.exit(0);
}

console.error("unknown command: " + cmd + ". Use add, add-unwind, list, execute or redeem.");
process.exit(2);
