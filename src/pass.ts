/**
 * `npm run pass -- [--execute] [--markets "<regex>"] [--timeout-min 45] [--prompt-only]`
 *
 * Runs one unattended trading pass for the model that owns this folder: builds the pass prompt from PASS.md plus
 * the facts of the moment (model, wallet, cash on hand, markets pattern, report path), launches the model's CLI
 * with that prompt on stdin, and records everything under .passes/<timestamp>/. With --execute it then runs the
 * queue executor (key mode) so the pass's decisions are carried out by a script, not by the model.
 *
 * Which CLI runs the model comes from PASS_COMMAND in .env, for example
 *   PASS_COMMAND=claude -p --model claude-fable-5-1 --allowedTools Bash,Read,Grep,Glob,WebFetch,WebSearch
 *   PASS_COMMAND=codex exec --full-auto
 * The prompt is written to stdin; a CLI that needs a file instead can use the placeholder {prompt_file}.
 *
 * This is the piece a scheduler calls every two hours. It never signs anything itself.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { parseArgs } from "./args.js";
import { getPublicClient } from "./clients.js";
import { CHAINS, parseChainId, SEER_ADDRESSES } from "./config.js";
import { erc20FullAbi } from "./dex.js";
import { marketFactoryAbi } from "./abis.js";
import "dotenv/config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const model = process.env.MODEL_NAME;
const wallet = process.env.LIQUIDITY_WALLET;
const passCommand = process.env.PASS_COMMAND;
const chainId = parseChainId(process.env.CHAIN_ID);
const markets = String(args.markets ?? process.env.PASS_MARKETS ?? "NU7|Zcash");
const timeoutMin = Number(args["timeout-min"] ?? 45);

if (!model || !wallet || !isAddress(wallet, { strict: false })) {
  console.error("MODEL_NAME and a valid LIQUIDITY_WALLET must be set in .env (see MODELS.md). Refusing to run a pass for an anonymous folder.");
  process.exit(2);
}
if (!passCommand && !args["prompt-only"]) {
  console.error("PASS_COMMAND is not set in .env: the command that runs this folder's model, e.g.");
  console.error('  PASS_COMMAND=claude -p --model claude-fable-5-1 --allowedTools Bash,Read,Grep,Glob,WebFetch,WebSearch');
  console.error("  PASS_COMMAND=codex exec --full-auto");
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join(ROOT, ".passes", stamp);
mkdirSync(dir, { recursive: true });
const reportPath = path.join(dir, "report.md");
const promptPath = path.join(dir, "prompt.md");
const outputPath = path.join(dir, "output.log");

// cash on hand, read from the chain: the bankroll the pass is allowed to reason about
const client = getPublicClient(chainId, process.env.RPC_URL || undefined);
let cash = 0;
let collateralSymbol = "collateral";
try {
  // the chain's collateral is whatever the Seer MarketFactory mints sets against (sUSDS on Optimism, sDAI on Gnosis)
  const collateral = (await client.readContract({ address: SEER_ADDRESSES[chainId].MarketFactory, abi: marketFactoryAbi, functionName: "collateralToken" })) as Address;
  const [bal, sym, dec] = await Promise.all([
    client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [getAddress(wallet)] }),
    client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "symbol" }),
    client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "decimals" }),
  ]);
  cash = Number(formatUnits(bal, Number(dec)));
  collateralSymbol = sym;
} catch (e) {
  console.error("could not read the wallet's collateral balance: " + (e as Error).message.split("\n")[0]);
  process.exit(1);
}

const template = readFileSync(path.join(ROOT, "PASS.md"), "utf8");
const facts = [
  "",
  "## The facts of this pass",
  "",
  "- Model: **" + model + "**",
  "- Wallet: `" + getAddress(wallet) + "` on chain " + chainId + " (" + CHAINS[chainId].name + ")",
  "- Folder: `" + ROOT + "`",
  "- Cash on hand right now: **" + cash.toFixed(2) + " " + collateralSymbol + "**. This is the bankroll for `--bankroll`.",
  "- Markets to consider: those matching `" + markets + "` in `npm run scan -- \"" + markets + "\"`.",
  "- Time: " + new Date().toISOString(),
  "- Write the report to: `" + reportPath + "`",
  "- Queue trades with `npm run queue -- add ...`; do not execute anything.",
  "",
].join("\n");
const prompt = template + facts;
writeFileSync(promptPath, prompt);
console.log("PASS     " + model + "  wallet " + getAddress(wallet) + "  cash " + cash.toFixed(2) + " " + collateralSymbol + "  markets /" + markets + "/");
console.log("         prompt  " + promptPath);
console.log("         report  " + reportPath);
if (args["prompt-only"]) {
  console.log("--prompt-only: not launching the model.");
  process.exit(0);
}

const cmdline = passCommand!.replace("{prompt_file}", '"' + promptPath + '"');
console.log("         running " + cmdline);
const started = Date.now();
const child = spawn(cmdline, { cwd: ROOT, shell: true, env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let output = "";
const onData = (d: Buffer) => {
  output += d.toString();
  process.stdout.write(d);
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.stdin.write(prompt);
child.stdin.end();
const timer = setTimeout(() => {
  console.error("\npass exceeded " + timeoutMin + " minutes: killing the model process.");
  child.kill();
}, timeoutMin * 60_000);
const code: number | null = await new Promise((resolve) => child.on("close", (c) => resolve(c)));
clearTimeout(timer);
writeFileSync(outputPath, output);
const result = { model, wallet: getAddress(wallet), cash, markets, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), exitCode: code, report: reportPath, output: outputPath };
writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2));
console.log("");
console.log("pass finished with exit code " + code + " after " + ((Date.now() - started) / 60_000).toFixed(1) + " min; output in " + outputPath);
if (/authenticate|OAuth|not logged in|login/i.test(output) && code !== 0) {
  console.error("The model CLI could not sign in. For Claude Code run `claude login` once in a terminal on this machine; for another CLI, its own login command. Then run the pass again.");
}

if (args.execute && code !== 0) {
  console.log("The model step failed, so the queue is NOT executed this round; whatever it queued waits for the next pass and expires after --max-age-min.");
  process.exit(code ?? 1);
}
if (args.execute) {
  console.log("");
  console.log("EXECUTE  running the queue (key mode) ...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npmCmd, ["run", "queue", "--", "execute", "--yes"], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: process.env, stdio: "inherit", timeout: 60 * 60_000 });
  process.exit(r.status ?? 1);
}
process.exit(code ?? 1);
