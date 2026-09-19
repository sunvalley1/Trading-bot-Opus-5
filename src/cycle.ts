/**
 * `npm run cycle -- [--execute] [--dry-run]`
 *
 * One trading cycle for the bot that owns this folder: the pass on the folder's own chain, then the Gnosis pass
 * when the folder has a Gnosis scope. Every day has two cycles, starting 11:00 and 21:00 local (CYCLE_STARTS in
 * .env overrides), and every cycle must happen: a pass lost to a sleeping or rebooting laptop, a killed runner or a
 * failed model step is redone within the same cycle, never left for the next one.
 *
 * The scheduled task starts this at the bot's slot and again every 30 minutes until the next cycle begins; each run
 * does only what the current cycle still lacks, chain by chain:
 *   - a pass of this cycle finished and wrote its report: done. If trades it queued are still pending and fresh
 *     (its executor was cut off), the executor runs for that chain.
 *   - the latest attempt wrote its report but its runner died before the executor (on 18 September a model killed
 *     its own runner): its fresh pending trades are executed rather than planned all over again.
 *   - otherwise, below 3 attempts this cycle (CYCLE_MAX_ATTEMPTS): the chain's pending items from the failed attempt
 *     are dropped, since a re-run plans from scratch, and the pass runs again.
 *   - otherwise it gives up on that chain for this cycle and says so: a model that fails three times in a row is
 *     failing for a reason (a usage limit, a sign-in) that retrying every half hour will not fix.
 * Nothing runs twice at once: the task ignores a start while its previous run is still going, this script holds a
 * lock with its PID, and it will not start while a pass of this folder is still alive (its PID, recorded in
 * result.json, running and under three hours old).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import "dotenv/config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASSES = path.join(ROOT, ".passes");
const PENDING = path.join(ROOT, ".queue", "pending.jsonl");
const EXECUTED = path.join(ROOT, ".queue", "executed.jsonl");
const LOCK = path.join(PASSES, "cycle.lock");
const args = parseArgs(process.argv.slice(2));
const execute = !!args.execute;
const dryRun = !!args["dry-run"] || !execute;
const maxAttempts = Number(process.env.CYCLE_MAX_ATTEMPTS ?? 3);
const maxAgeMin = 150; // the executor's own staleness limit
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const homeChain = Number(process.env.CHAIN_ID ?? 10);
const now = new Date();
const stamp = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------- which cycle is this
const starts = String(process.env.CYCLE_STARTS ?? "11:00,21:00")
  .split(",")
  .map((s) => s.trim().match(/^(\d{1,2}):(\d{2})$/))
  .filter((m): m is RegExpMatchArray => !!m)
  .map((m) => Number(m[1]) * 60 + Number(m[2]));
const candidates: Date[] = [];
for (const dayOffset of [0, -1]) {
  for (const minutes of starts) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (d <= now) candidates.push(d);
  }
}
const cycleStart = new Date(Math.max(...candidates.map((d) => d.getTime())));
const cycleName = (cycleStart.getHours() < 16 ? "morning" : "night") + " cycle of " + cycleStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " (from " + cycleStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + ")";

// ---------------------------------------------------------------- what already happened in it
interface PassRecord { dir: string; chain: number; started: Date; status: string; pid?: number; exited: boolean; report: boolean }
const alive = (pid?: number) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};
function passes(): PassRecord[] {
  if (!existsSync(PASSES)) return [];
  const out: PassRecord[] = [];
  for (const name of readdirSync(PASSES)) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-chain(\d+))?$/);
    if (!m) continue;
    const started = new Date(m[1] + "T" + m[2] + ":" + m[3] + ":" + m[4] + "." + m[5] + "Z");
    const dir = path.join(PASSES, name);
    // a --prompt-only run writes its prompt and stops before result.json; it was never an attempt
    if (!existsSync(path.join(dir, "result.json")) && existsSync(path.join(dir, "prompt.md"))) continue;
    let status = "no result";
    let pid: number | undefined;
    let exited = false;
    try {
      const r = JSON.parse(readFileSync(path.join(dir, "result.json"), "utf8"));
      status = String(r.status ?? "?");
      pid = typeof r.pid === "number" ? r.pid : undefined;
      exited = !!r.exitedAt;
    } catch {
      /* a pass that died before writing its result is an attempt that failed */
    }
    out.push({ dir, chain: m[6] ? Number(m[6]) : homeChain, started, status, pid, exited, report: existsSync(path.join(dir, "report.md")) });
  }
  return out.sort((a, b) => a.started.getTime() - b.started.getTime());
}
// Alive until pass.ts writes exitedAt, which it does last, after its executor: "finished" alone only means the
// model is done, and the executor may still be trading. Passes started before PIDs were recorded (19 Sep) count as
// alive while they could still be running at all.
const running = (p: PassRecord) => {
  const age = now.getTime() - p.started.getTime();
  if (p.exited || age > 3 * 3600_000) return false;
  if (p.pid) return alive(p.pid);
  return p.status === "running" && age < 150 * 60_000;
};

interface QueueItem { id: string; createdAt: string; chain: number; [k: string]: unknown }
const readQueue = (): QueueItem[] => (existsSync(PENDING) ? readFileSync(PENDING, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const freshPending = (chain: number) => readQueue().filter((q) => Number(q.chain) === chain && now.getTime() - Date.parse(q.createdAt) <= maxAgeMin * 60_000);

/** A re-run plans from scratch, so what a failed attempt queued is filed away unexecuted. */
function dropPending(chain: number, why: string) {
  const items = readQueue();
  const drop = items.filter((q) => Number(q.chain) === chain);
  if (!drop.length) return;
  writeFileSync(PENDING, items.filter((q) => Number(q.chain) !== chain).map((q) => JSON.stringify(q)).join("\n") + (items.length > drop.length ? "\n" : ""));
  for (const q of drop) appendFileSync(EXECUTED, JSON.stringify({ ...q, executedAt: new Date().toISOString(), status: "stale", reason: why }) + "\n");
  console.log("CYCLE    dropped " + drop.length + " pending item(s) on chain " + chain + ": " + why);
}

function run(npmArgs: string[]): number {
  console.log("CYCLE    " + stamp() + "  npm " + npmArgs.join(" "));
  if (dryRun) return 0;
  const r = spawnSync(npmCmd, npmArgs, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: process.env, timeout: 3 * 3600_000 });
  return r.status ?? 1;
}

// ---------------------------------------------------------------- one run at a time
if (existsSync(LOCK)) {
  const [pidText, since] = readFileSync(LOCK, "utf8").split(/\s+/);
  const held = Number(pidText);
  // a cycle run cannot outlive its task's 3-hour limit, so an older lock is a leftover whose PID may belong to anything
  const recent = now.getTime() - Date.parse(since ?? "") < 3 * 3600_000;
  if (recent && alive(held) && held !== process.pid) {
    console.log("CYCLE    " + stamp() + "  another cycle run is going (PID " + held + "); nothing to do.");
    process.exit(0);
  }
}
if (!dryRun) writeFileSync(LOCK, process.pid + " " + new Date().toISOString());
const release = () => {
  try {
    if (!dryRun && existsSync(LOCK) && readFileSync(LOCK, "utf8").startsWith(String(process.pid))) unlinkSync(LOCK);
  } catch {
    /* a stale lock is harmless: the next run sees its PID is gone */
  }
};

try {
  const live = passes().filter(running);
  if (live.length) console.log("CYCLE    " + stamp() + "  a pass is still running (" + path.basename(live[0].dir) + ", PID " + live[0].pid + "); leaving it be.");
  else runCycle();
} finally {
  release();
}

function runCycle() {
  const chains =[homeChain, ...Object.keys(process.env).map((k) => k.match(/^PASS_MARKET_LIST_(\d+)$/)?.[1]).filter((c): c is string => !!c).map(Number).filter((c) => c !== homeChain && (process.env["PASS_MARKET_LIST_" + c] ?? "").trim())];
  const summary: string[] = [];
  for (const chain of chains) {
    const mine = passes().filter((p) => p.chain === chain && p.started >= cycleStart);
    const done = mine.find((p) => p.status === "finished" && p.report);
    const latest = mine[mine.length - 1];
    const fresh = freshPending(chain);
    if (done) {
      if (fresh.length) {
        // the pass finished but its executor was cut off: carry out what it decided
        run(["run", "queue", "--", "execute", "--yes", "--chain", String(chain)]);
        summary.push("chain " + chain + ": done, " + fresh.length + " pending trade(s) executed");
      } else summary.push("chain " + chain + ": done");
      continue;
    }
    if (latest && latest.report && latest.status !== "finished" && fresh.length) {
      // the model finished its report but its runner died before the executor: its decisions are still good
      run(["run", "queue", "--", "execute", "--yes", "--chain", String(chain)]);
      if (!dryRun) {
        try {
          const f = path.join(latest.dir, "result.json");
          const r = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
          writeFileSync(f, JSON.stringify({ ...r, status: "finished", finishedAt: new Date().toISOString(), note: "runner died after the report; cycle.ts executed its queue" }, null, 2));
        } catch {
          /* the record is a convenience; the trades are what mattered */
        }
      }
      summary.push("chain " + chain + ": runner died after the report, its " + fresh.length + " queued trade(s) executed");
      continue;
    }
    if (mine.length >= maxAttempts) {
      summary.push("chain " + chain + ": GAVE UP after " + mine.length + " failed attempts this cycle (" + mine.map((p) => p.status).join(", ") + ")");
      continue;
    }
    if (mine.length) dropPending(chain, "attempt " + mine.length + " of this cycle did not finish; the cycle re-runs the pass");
    const code = run(["run", "pass", "--", ...(chain === homeChain ? [] : ["--chain", String(chain)]), "--execute"]);
    summary.push("chain " + chain + ": " + (mine.length ? "re-run, attempt " + (mine.length + 1) : "ran") + ", exit " + code);
  }
  console.log("CYCLE    " + stamp() + "  " + (process.env.MODEL_NAME ?? "") + " " + cycleName + ": " + summary.join("; ") + (dryRun ? "  (dry run)" : ""));
}
