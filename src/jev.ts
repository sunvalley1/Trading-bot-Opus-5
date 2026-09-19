/**
 * `npm run jev [-- --chain 100] [--dry-run]`: one pass of the Jev bot (MODELS.md; the logic is in jev-pass.ts).
 *
 * This launcher exists so that the process that talks to classifier.dev never holds the wallet's private key. The
 * repository's modules load .env for themselves ("dotenv/config"), which would put PRIVATE_KEY into this process
 * too; here dotenv is pointed at a file that does not exist before any of them is imported, and only the settings
 * the pass needs are copied in from .env by name. The key stays with the executor, which pass.ts runs afterwards
 * in a process of its own.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DOTENV_CONFIG_PATH = path.join(ROOT, ".env.jev-loads-nothing");
delete process.env.PRIVATE_KEY;

// the settings a Jev pass may read; nothing else from .env enters this process
const ALLOWED = /^(MODEL_NAME|CHAIN_ID|LIQUIDITY_WALLET|RPC_URL(_\d+)?|PASS_MARKET_LIST(_\d+)?|PASS_MARKETS(_\d+)?|JEV_[A-Z_]+)$/;
const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && ALLOWED.test(m[1]) && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

await import("./jev-pass.js");
