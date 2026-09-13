import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mirrors everything a money command prints into `.trade-logs/<timestamp>-<kind>-<pid>.log` (ignored by git
 * through `*.log`), so a run can be read afterwards by whoever checks it, without asking the human to paste
 * their terminal. A crash that Node would print straight to stderr is captured too; the process then exits
 * exactly as it would have. Logging failures are swallowed: a log must never break a trade.
 */
export function startRunLog(kind: string): string | undefined {
  const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".trade-logs");
  const logFile = path.join(logDir, new Date().toISOString().replace(/[:.]/g, "-") + "-" + kind + "-" + process.pid + ".log");
  const logLine = (s: string) => {
    try {
      appendFileSync(logFile, s + "\n");
    } catch {
      /* logging must never break a run */
    }
  };
  try {
    mkdirSync(logDir, { recursive: true });
    logLine("# " + new Date().toISOString() + "  npm run " + kind + " -- " + process.argv.slice(2).join(" "));
    for (const k of ["log", "error", "warn"] as const) {
      const orig = console[k].bind(console);
      console[k] = (...a: unknown[]) => {
        orig(...a);
        logLine(a.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.stack ?? x.message : String(x))).join(" "));
      };
    }
    process.on("uncaughtException", (e) => {
      logLine("UNCAUGHT " + (e?.stack ?? String(e)));
      process.stderr.write((e?.stack ?? String(e)) + "\n");
      process.exit(1);
    });
    process.on("unhandledRejection", (e) => {
      const err = e as Error | undefined;
      logLine("UNHANDLED " + (err?.stack ?? String(e)));
      process.stderr.write((err?.stack ?? String(e)) + "\n");
      process.exit(1);
    });
    console.log("LOG      " + logFile);
    return logFile;
  } catch {
    return undefined;
  }
}
