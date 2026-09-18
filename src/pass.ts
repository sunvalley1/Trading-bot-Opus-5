/**
 * `npm run pass -- [--chain 100] [--execute] [--markets "<regex>"] [--timeout-min 45] [--prompt-only]`
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
 * One pass covers one chain: the folder's own (CHAIN_ID) by default, another with --chain. Each chain has its own
 * scope in .env: PASS_MARKET_LIST_<chain> (and for CHAIN_ID, plain PASS_MARKET_LIST), PASS_MARKETS_<chain> likewise.
 * A pass on a chain other than CHAIN_ID with no scope list there has nothing to do and exits 0, so the scheduler
 * can run every chain's pass for every folder and only the folders that trade a chain actually do.
 *
 * This is the piece a scheduler calls on a fixed schedule (see scripts/schedule-passes.ps1). It never signs anything itself.
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
import { readMarket } from "./market-view.js";
import "dotenv/config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const model = process.env.MODEL_NAME;
const wallet = process.env.LIQUIDITY_WALLET;
const passCommand = process.env.PASS_COMMAND;
const homeChain = parseChainId(process.env.CHAIN_ID);
const chainId = parseChainId((args.chain as string | undefined) ?? process.env.CHAIN_ID);
const home = Number(chainId) === Number(homeChain);
const scopeRaw = process.env["PASS_MARKET_LIST_" + chainId] ?? (home ? process.env.PASS_MARKET_LIST : undefined);
const scope = (scopeRaw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const markets = String(args.markets ?? process.env["PASS_MARKETS_" + chainId] ?? (home ? process.env.PASS_MARKETS : undefined) ?? "NU7|Zcash");
if (!home && !scope.length) {
  console.log("PASS     nothing in scope on chain " + chainId + " (PASS_MARKET_LIST_" + chainId + " is not set in .env): no pass there.");
  process.exit(0);
}
// a full research pass with a high-reasoning model takes 30-60 minutes; the slots are hours apart, so 90 is safe
// a folder can set its own limit (PASS_TIMEOUT_MIN): a model working through a large scope in one context runs longer
const timeoutMin = Number(args["timeout-min"] ?? process.env.PASS_TIMEOUT_MIN ?? 90);

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

const stamp = new Date().toISOString().replace(/[:.]/g, "-") + (home ? "" : "-chain" + chainId);
const dir = path.join(ROOT, ".passes", stamp);
mkdirSync(dir, { recursive: true });
const reportPath = path.join(dir, "report.md");
const promptPath = path.join(dir, "prompt.md");
const outputPath = path.join(dir, "output.log");

// cash on hand, read from the chain: the bankroll the pass is allowed to reason about
const client = getPublicClient(chainId);
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

// What each market in scope is, read from the chain: a conditional market and a scalar one are traded differently
// (see the skill), and the model should know which it is looking at before it reads a single price. Best effort:
// a slow RPC leaves the list unannotated rather than stopping the pass.
const notes = new Map<string, string>();
let anyConditional = false;
let anyScalar = false;
try {
  const parents = new Map<string, Awaited<ReturnType<typeof readMarket>>>();
  for (const a of scope) {
    if (!isAddress(a, { strict: false })) continue;
    const info = await readMarket(client, chainId, getAddress(a));
    const parts: string[] = [];
    if (!/^0x0{40}$/i.test(info.parentMarket.id)) {
      anyConditional = true;
      const pid = info.parentMarket.id.toLowerCase();
      if (!parents.has(pid)) parents.set(pid, await readMarket(client, chainId, getAddress(info.parentMarket.id)));
      const parent = parents.get(pid)!;
      parts.push('conditional on "' + (parent.outcomes[Number(info.parentOutcome)] ?? "?") + '" of ' + (Number(parent.templateId) === 3 ? "multi-select " : "") + "parent " + getAddress(info.parentMarket.id));
    }
    if (Number(info.templateId) === 1 && info.upperBound > info.lowerBound) {
      anyScalar = true;
      parts.push("scalar " + formatUnits(info.lowerBound, 18) + ".." + formatUnits(info.upperBound, 18));
    }
    if (parts.length) notes.set(a.toLowerCase(), parts.join(", "));
  }
} catch (e) {
  console.error("(could not annotate the scope from the chain: " + (e as Error).message.split("\n")[0] + ")");
}
const chainFlag = home ? "" : " --chain " + chainId;

const template = readFileSync(path.join(ROOT, "PASS.md"), "utf8");
const facts = [
  "",
  "## The facts of this pass",
  "",
  "- Model: **" + model + "**",
  "- Wallet: `" + getAddress(wallet) + "` on chain " + chainId + " (" + CHAINS[chainId].name + ")",
  "- Folder: `" + ROOT + "`",
  "- Cash on hand right now: **" + cash.toFixed(2) + " " + collateralSymbol + "**. This is the bankroll for `--bankroll`.",
  ...(scope.length
    ? [
        "- Markets in scope: **exactly these, and nothing else** (the queue refuses any other market):",
        ...scope.map((a) => "    - `" + a + "`  https://app.seer.pm/markets/" + chainId + "/" + a + (notes.has(a.toLowerCase()) ? "  (" + notes.get(a.toLowerCase()) + ")" : "")),
      ]
    : ["- Markets to consider: those matching `" + markets + "` in `npm run scan -- \"" + markets + "\"`."]),
  ...(home
    ? []
    : [
        "- **This pass is on chain " + chainId + ", not the folder's default chain " + homeChain + ".** Give every command `--chain " + chainId + "` (or the full app.seer.pm link",
        "  as the market): `npm run market`, `plan`, `fleet` (\"chain\": " + chainId + " per market), `trade --dry-run`, `unwind --dry-run`, `queue -- add`.",
        "  Your book here: `npm run portfolio -- --account " + getAddress(wallet) + " --chain " + chainId + " --scope`.",
      ]),
  ...(anyConditional || anyScalar
    ? [
        "- " + [anyConditional ? "conditional" : "", anyScalar ? "scalar" : ""].filter(Boolean).join(" and ") + " markets are in scope: read the skill's section **Conditional and scalar markets** before estimating any of them.",
      ]
    : []),
  "- Time: " + new Date().toISOString(),
  "- Write the report to: `" + reportPath + "`",
  "- Queue trades with `npm run queue -- add ..." + chainFlag + "`; do not execute anything.",
  "",
].join("\n");
const prompt = template + facts;
writeFileSync(promptPath, prompt);
console.log("PASS     " + model + "  wallet " + getAddress(wallet) + "  chain " + chainId + "  cash " + cash.toFixed(2) + " " + collateralSymbol + "  " + (scope.length ? scope.length + " markets in scope" : "markets /" + markets + "/"));
console.log("         prompt  " + promptPath);
console.log("         report  " + reportPath);
if (args["prompt-only"]) {
  console.log("--prompt-only: not launching the model.");
  process.exit(0);
}

const cmdline = passCommand!.replace("{prompt_file}", '"' + promptPath + '"');
console.log("         running " + cmdline);
const started = Date.now();
// written now and overwritten at the end, so a launcher killed mid-run (scheduler stopped, machine rebooted)
// still leaves a record of what was started and when
writeFileSync(path.join(dir, "result.json"), JSON.stringify({ model, wallet: getAddress(wallet), chain: chainId, cash, markets, startedAt: new Date(started).toISOString(), status: "running", command: cmdline, report: reportPath, output: outputPath }, null, 2));
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
const result = { model, wallet: getAddress(wallet), chain: chainId, cash, markets, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), status: code === 0 ? "finished" : "failed", exitCode: code, command: cmdline, report: reportPath, output: outputPath };
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
  console.log("EXECUTE  running this chain's queue (key mode) ...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npmCmd, ["run", "queue", "--", "execute", "--yes", "--chain", String(chainId)], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: process.env, stdio: "inherit", timeout: 60 * 60_000 });
  process.exit(r.status ?? 1);
}
process.exit(code ?? 1);
