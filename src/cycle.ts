/**
 * `npm run cycle -- [--execute] [--dry-run]`
 *
 * One trading cycle for the bot that owns this folder: the pass on the folder's own chain, then the Gnosis pass
 * when the folder has a Gnosis scope. Every day has two cycles, starting 11:00 and 21:00 local (CYCLE_STARTS in
 * .env overrides), and every cycle must happen: a pass lost to a sleeping or rebooting laptop, a killed runner or a
 * failed model step is redone within the same cycle, never left for the next one.
 *
 * The scheduled task starts this at the bot's slot and again every 30 minutes until the next cycle begins. A run
 * that finds the cycle complete, or a pass still going, does nothing and prints nothing. Otherwise, chain by chain:
 *   - an attempt of this cycle got as far as its report (the model decided, "no trade" included) and nothing it
 *     queued is left: done.
 *   - it decided but its executor was cut off (the runner died after the report, as when a model killed its own
 *     runner on 18 September, or the laptop slept mid-execution), and trades it queued this cycle are still pending:
 *     they are executed, but only where the market's prices have not moved since each was queued
 *     (CYCLE_PRICE_TOLERANCE, default 0.02 = two points on any outcome, set by the human on 19 September). If any market has moved, those trades are
 *     not executed and the pass runs again, because its decision was made at the old prices.
 *   - otherwise, below 3 attempts this cycle (CYCLE_MAX_ATTEMPTS): what the failed attempt queued is dropped, since a
 *     re-run plans from scratch, and the pass runs again.
 *   - otherwise it gives up on that chain for this cycle and says so: a model that fails three times in a row is
 *     failing for a reason (a usage limit, a sign-in) that retrying every half hour will not fix.
 * A launch Windows itself refuses (0xC0000142, the session out of room while five bots work) is not a failed pass:
 * nothing ran, so it is started again a minute later, up to three times, rather than left for the next run.
 * Nothing runs twice at once: the task ignores a start while its previous run is going, this script holds a lock
 * with its PID, and it will not start while a pass of this folder is still alive (pass.ts records its PID and writes
 * exitedAt last, after its executor). While it does have work to do it holds off sleep (scripts/keep-awake.ps1),
 * because the laptop's idle timer cannot see that a headless pass is running.
 */
import { spawn, spawnSync } from "node:child_process";
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
// one lock for every bot on this machine: passes take 25-60 minutes but start 20 apart, so they overlap by default
const FLEET_LOCK = path.join(ROOT, "..", "pass-in-progress.lock");
const args = parseArgs(process.argv.slice(2));
const execute = !!args.execute;
const dryRun = !!args["dry-run"] || !execute;
const maxAttempts = Number(process.env.CYCLE_MAX_ATTEMPTS ?? 3);
const tolerance = Number(process.env.CYCLE_PRICE_TOLERANCE ?? 0.02);
const waitForOthers = Number(process.env.CYCLE_WAIT_FOR_OTHERS_MIN ?? 45);
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
// model is done, and the executor may still be trading.
const running = (p: PassRecord) => {
  const age = now.getTime() - p.started.getTime();
  if (p.exited || age > 3 * 3600_000) return false;
  if (p.pid) return alive(p.pid);
  // no PID recorded: a pass from before 19 September, which may be executing after marking itself finished
  return p.status !== "no result" && age < 150 * 60_000;
};

interface QueueItem { id: string; createdAt: string; chain: number; [k: string]: unknown }
const readQueue = (): QueueItem[] => (existsSync(PENDING) ? readFileSync(PENDING, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const cyclePending = (chain: number) => readQueue().filter((q) => Number(q.chain) === chain && Date.parse(q.createdAt) >= cycleStart.getTime());

/** A re-run plans from scratch, so what an earlier attempt queued is filed away unexecuted. */
function dropPending(chain: number, why: string) {
  const items = readQueue();
  const drop = items.filter((q) => Number(q.chain) === chain);
  if (!drop.length) return;
  if (!dryRun) {
    writeFileSync(PENDING, items.filter((q) => Number(q.chain) !== chain).map((q) => JSON.stringify(q)).join("\n") + (items.length > drop.length ? "\n" : ""));
    for (const q of drop) appendFileSync(EXECUTED, JSON.stringify({ ...q, executedAt: new Date().toISOString(), status: "stale", reason: why }) + "\n");
  }
  console.log("CYCLE    dropped " + drop.length + " pending item(s) on chain " + chain + ": " + why);
}

let holdingAwake = false;

/**
 * Asks Windows not to sleep while this cycle works. A pass takes no input, so the idle timer sleeps the laptop under
 * it: on 21 September it slept at 21:48 and killed two passes mid-run, and a killed pass costs the model's usage as
 * well as the pass. The helper holds the request only until this process exits, so an idle bot never keeps the
 * machine up, and -WakeToRun on the task covers the slots the machine is already asleep for.
 */
function keepAwake(): void {
  if (holdingAwake || dryRun || process.platform !== "win32") return;
  holdingAwake = true;
  try {
    const helper = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "scripts", "keep-awake.ps1"), "-ParentPid", String(process.pid)],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    helper.unref();
  } catch {
    /* a laptop that sleeps under a pass is a nuisance, not a reason to skip the cycle */
  }
}

/** 0xC0000142 (STATUS_DLL_INIT_FAILED): Windows refused to start the process. Nothing ran, so no model failed. */
const DID_NOT_START = 3221225794;

const sleepFor = (ms: number) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** How a run ended, for the one-line summary: a launch Windows refused is not a pass that failed. */
const outcome = (code: number) => (code === DID_NOT_START ? "Windows would not start it (0xC0000142), so nothing ran" : "exit " + code);

/**
 * Waits for whichever bot is mid-pass, then claims the turn. Five bots working at once exhausts what one Windows
 * session can start: on 24 September Opus and Astra each had all three launches refused with 0xC0000142 while Fable
 * and Sol were mid-pass, which is a lost pass for a reason that has nothing to do with either model. Taking turns
 * costs an hour of wall clock inside a ten-hour cycle and buys back the whole pass.
 *
 * Deliberately forgiving: a lock whose process is gone, or one older than the task's own three-hour limit, is
 * ignored, and after CYCLE_WAIT_FOR_OTHERS_MIN it goes ahead anyway rather than skip the pass.
 */
function waitForTurn(): void {
  if (dryRun || !waitForOthers) return;
  const until = Date.now() + waitForOthers * 60_000;
  let said = false;
  while (Date.now() < until) {
    let holder = "";
    try {
      if (!existsSync(FLEET_LOCK)) break;
      const [bot, pidText, since] = readFileSync(FLEET_LOCK, "utf8").split(/\s+/);
      const pid = Number(pidText);
      const fresh = Date.now() - Date.parse(since ?? "") < 3 * 3600_000;
      if (!fresh || !alive(pid) || pid === process.pid) break;
      holder = bot ?? "another bot";
    } catch {
      break; // an unreadable lock is not a reason to skip a pass
    }
    if (!said) {
      console.log("CYCLE    " + stamp() + "  " + holder + " is mid-pass; waiting up to " + waitForOthers + " min for its turn to end");
      said = true;
    }
    sleepFor(60_000);
  }
  try {
    writeFileSync(FLEET_LOCK, (process.env.MODEL_NAME ?? path.basename(ROOT)) + " " + process.pid + " " + new Date().toISOString());
  } catch {
    /* the lock is a courtesy between bots, not a gate */
  }
}

function releaseTurn(): void {
  try {
    if (existsSync(FLEET_LOCK) && readFileSync(FLEET_LOCK, "utf8").includes(" " + process.pid + " ")) unlinkSync(FLEET_LOCK);
  } catch {
    /* it ages out by itself */
  }
}

function run(npmArgs: string[]): number {
  console.log("CYCLE    " + stamp() + "  npm " + npmArgs.join(" "));
  if (dryRun) return 0;
  keepAwake();
  // only a pass takes a turn: the executor and the redeem sweep start a handful of processes, but they kept the lock
  // for the rest of the cycle, which is why Opus waited its full 45 minutes on 24 September after Astra had finished
  const isPass = npmArgs.includes("pass");
  if (isPass) waitForTurn();
  // With five bots at work the session runs out of room and Windows fails the launch itself, which cost Sol both of
  // its chains on 22 September. Starting again a minute later costs nothing; waiting for the next half-hourly run
  // would cost the pass, and a launch that never happened leaves no attempt behind to show what went wrong.
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync(npmCmd, npmArgs, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: process.env, timeout: 3 * 3600_000 });
    const code = r.status ?? 1;
    if (code !== DID_NOT_START || attempt >= 3) {
      if (isPass) releaseTurn();
      return code;
    }
    console.log("CYCLE    " + stamp() + "  " + outcome(code) + "; starting again in " + attempt + " minute(s) (attempt " + attempt + " of 3)");
    sleepFor(attempt * 60_000);
  }
}

/**
 * Carries out what a cut-off pass queued this cycle, at unchanged prices only (queue.ts --unchanged-within). Returns
 * how many items were refused because their market had moved: those need the pass run again.
 */
function resume(chain: number): number {
  const since = new Date().toISOString();
  const ageLimit = Math.ceil((now.getTime() - cycleStart.getTime()) / 60_000) + 1;
  run(["run", "queue", "--", "execute", "--yes", "--chain", String(chain), "--unchanged-within", String(tolerance), "--max-age-min", String(ageLimit)]);
  if (dryRun || !existsSync(EXECUTED)) return 0;
  return readFileSync(EXECUTED, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes('"repriced"'))
    .map((l) => JSON.parse(l))
    .filter((r) => r.status === "repriced" && Number(r.chain) === chain && r.executedAt >= since).length;
}

function passAgain(chain: number): number {
  return run(["run", "pass", "--", ...(chain === homeChain ? [] : ["--chain", String(chain)]), "--execute"]);
}

/** Records that a chain was given up on this cycle, and says whether that is news (so it is logged once). */
function firstGiveUp(chain: number): boolean {
  const marker = path.join(PASSES, "gave-up-" + cycleStart.toISOString().replace(/[:.]/g, "-") + "-chain" + chain);
  if (existsSync(marker)) return false;
  if (!dryRun) writeFileSync(marker, new Date().toISOString());
  return true;
}

function runCycle() {
  const chains = [homeChain, ...Object.keys(process.env).map((k) => k.match(/^PASS_MARKET_LIST_(\d+)$/)?.[1]).filter((c): c is string => !!c).map(Number).filter((c) => c !== homeChain && (process.env["PASS_MARKET_LIST_" + c] ?? "").trim())];
  const summary: string[] = [];
  let acted = false;
  for (const chain of chains) {
    const mine = passes().filter((p) => p.chain === chain && p.started >= cycleStart);
    // the latest attempt whose model got as far as its report: its decisions are made, whatever became of its runner
    const decided = [...mine].reverse().find((p) => p.report);
    const pending = cyclePending(chain);
    if (decided && !pending.length) {
      summary.push("chain " + chain + ": done");
      continue;
    }
    if (decided) {
      // it decided, then its executor was cut off: carry out what it queued, at the prices it decided at
      acted = true;
      const moved = resume(chain);
      if (!moved) {
        if (decided.status !== "finished" && !dryRun) {
          try {
            const f = path.join(decided.dir, "result.json");
            const r = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
            writeFileSync(f, JSON.stringify({ ...r, status: "finished", exitedAt: new Date().toISOString(), note: "runner died after the report; cycle.ts executed its queue at unchanged prices" }, null, 2));
          } catch {
            /* the record is a convenience; the trades are what mattered */
          }
        }
        summary.push("chain " + chain + ": executed the " + pending.length + " trade(s) a cut-off pass had queued, at unchanged prices");
        continue;
      }
      if (mine.length >= maxAttempts) {
        if (firstGiveUp(chain)) summary.push("chain " + chain + ": " + moved + " queued trade(s) not executed because their market moved, and no attempts left this cycle");
        else acted = false;
        continue;
      }
      dropPending(chain, "the market moved since these were queued; the cycle re-runs the pass");
      const code = passAgain(chain);
      summary.push("chain " + chain + ": " + moved + " queued trade(s) met moved prices, so the pass ran again (attempt " + (mine.length + 1) + "), " + outcome(code));
      continue;
    }
    if (mine.length >= maxAttempts) {
      if (firstGiveUp(chain)) {
        acted = true;
        summary.push("chain " + chain + ": GAVE UP after " + mine.length + " failed attempts this cycle (" + mine.map((p) => p.status).join(", ") + ")");
      }
      continue;
    }
    acted = true;
    if (mine.length) dropPending(chain, "attempt " + mine.length + " of this cycle did not finish; the cycle re-runs the pass");
    const code = passAgain(chain);
    summary.push("chain " + chain + ": " + (mine.length ? "re-run, attempt " + (mine.length + 1) : "ran") + ", " + outcome(code));
  }
  if (acted || dryRun) console.log("CYCLE    " + stamp() + "  " + (process.env.MODEL_NAME ?? "") + " " + cycleName + ": " + summary.join("; ") + (dryRun ? "  (dry run)" : ""));
}

// ---------------------------------------------------------------- one run at a time
if (existsSync(LOCK)) {
  const [pidText, since] = readFileSync(LOCK, "utf8").split(/\s+/);
  const held = Number(pidText);
  // a cycle run cannot outlive its task's 3-hour limit, so an older lock is a leftover whose PID may belong to anything
  const recent = now.getTime() - Date.parse(since ?? "") < 3 * 3600_000;
  if (recent && alive(held) && held !== process.pid) process.exit(0);
}
if (!dryRun) writeFileSync(LOCK, process.pid + " " + new Date().toISOString());
try {
  // a pass still going, or a cycle already complete, is the usual case every 30 minutes: say nothing then
  const live = passes().filter(running);
  if (!live.length) runCycle();
  else if (dryRun) console.log("CYCLE    " + stamp() + "  a pass is still running (" + path.basename(live[0].dir) + "); nothing to do  (dry run)");
} finally {
  try {
    if (!dryRun && existsSync(LOCK) && readFileSync(LOCK, "utf8").startsWith(String(process.pid))) unlinkSync(LOCK);
  } catch {
    /* a stale lock is harmless: the next run sees its PID is gone */
  }
}
