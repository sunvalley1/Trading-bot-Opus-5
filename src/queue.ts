/**
 * `npm run queue -- add <market> --outcome <i> --route <direct|split|fade> --size <x> [--allow-add] [--note "..."]`
 * `npm run queue -- list`
 * `npm run queue -- execute [--dry-run | --yes] [--max-age-min 150] [--max 10]`
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
 * Files (both ignored by git): .queue/pending.jsonl and .queue/executed.jsonl, one JSON object per line.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress } from "viem";
import { parseArgs } from "./args.js";
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
  /** "trade" (the default) runs `npm run trade`; "unwind" runs `npm run unwind` to exit the market's position */
  kind?: "trade" | "unwind";
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
  status: "done" | "failed" | "stale" | "dry-run";
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
const chain = Number(process.env.CHAIN_ID ?? 10);
const wallet = process.env.LIQUIDITY_WALLET;
const model = process.env.MODEL_NAME;

// The experiment trades a fixed list of markets (MODELS.md). When PASS_MARKET_LIST is set, a trade on anything
// else is refused here, at the queue, so no pass can widen the scope by accident.
const allowed = (process.env.PASS_MARKET_LIST ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function requireInScope(market: string) {
  if (!allowed.length) return;
  const m = market.toLowerCase();
  if (allowed.some((a) => m.includes(a))) return;
  console.error("OUT OF SCOPE: " + market + " is not one of the markets this experiment trades (PASS_MARKET_LIST in .env, listed in MODELS.md). Refusing to queue it.");
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
  requireInScope(market);
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
  console.log("queued " + item.id + ": " + route + " outcome " + outcome + " size " + size + " on " + market + (item.allowAdd ? "  (--allow-add)" : ""));
  console.log("It is executed by `npm run queue -- execute --yes` (key mode) or by a human running the printed trade command.");
  process.exit(0);
}

if (cmd === "add-unwind") {
  const market = args._[1];
  if (!market) {
    console.error('usage: npm run queue -- add-unwind <market address|slug|url> [--sets <n>] [--note "..."]');
    process.exit(2);
  }
  requireInScope(market);
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
  console.log("queued " + item.id + ": unwind the position on " + market + (item.sets ? " in rounds of " + item.sets + " sets" : ""));
  process.exit(0);
}

if (cmd === "list" || cmd === undefined) {
  const pending = readItems<Item>(PENDING);
  const executed = readItems<Executed>(EXECUTED);
  console.log("QUEUE  " + (model ?? "(no MODEL_NAME)") + "  wallet " + (wallet ?? "(unset)") + "  chain " + chain);
  console.log("");
  console.log("pending (" + pending.length + ")");
  const describe = (p: Item) => (p.kind === "unwind" ? "unwind" + (p.sets ? " (rounds of " + p.sets + ")" : "") + "  " + p.market : p.route.padEnd(6) + " outcome " + p.outcome + "  size " + String(p.size).padStart(8) + "  " + p.market + (p.allowAdd ? "  --allow-add" : ""));
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
  const max = Number(args.max ?? 10);
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
  if (!pending.length) {
    console.log("nothing queued.");
    process.exit(0);
  }
  console.log("EXECUTE  " + (model ?? "") + "  wallet " + getAddress(wallet) + "  " + pending.length + " pending  " + (dryRun ? "(dry run: every trade with --dry-run, nothing sent)" : "(LIVE: --yes)"));
  let ran = 0;
  for (const item of [...pending]) {
    if (ran >= max) break;
    const ageMin = (Date.now() - Date.parse(item.createdAt)) / 60_000;
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
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
      result = { ...item, executedAt: new Date().toISOString(), status: dryRun ? "dry-run" : r.status === 0 ? "done" : "failed", exitCode: r.status ?? undefined, log: logMatch?.[1]?.trim() };
      if (r.status !== 0) result.reason = "trade exited " + r.status + (r.error ? ": " + r.error.message : "");
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
  console.log("");
  console.log("done. " + pending.length + " still pending. `npm run queue -- list` shows the record; `npm run portfolio -- --account " + getAddress(wallet) + "` shows the book.");
  process.exit(0);
}

console.error("unknown command: " + cmd + ". Use add, list or execute.");
process.exit(2);
