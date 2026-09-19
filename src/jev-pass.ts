/**
 * A pass of the Jev bot (MODELS.md). Started by jev.ts, which keeps the wallet's key out of this process; pass.ts
 * runs that as the folder's PASS_COMMAND and hands over the chain and the report path in PASS_CHAIN / PASS_REPORT /
 * PASS_DIR. The pass prompt pass.ts writes to stdin is not read: this bot is a script, not a model with tools.
 *
 * Jev is TypeSafe's "System One" decision model: it does not research, deliberate or use tools; it reads a state and
 * returns a calibrated probability for each label it is given, in well under a second. So for every market in scope
 * this pass gathers a fixed set of public facts, asks Jev through classifier.dev (classifier.ts, which refuses to send
 * anything that looks secret and logs every request), turns the answer into a probability per outcome, and from there
 * follows the method every other bot follows: blend with the market price at the skill's default weight (0.25 for the
 * model, JEV_WEIGHT), quarter Kelly against live quotes, the default caps, at most one trade per market, queued with
 * `npm run queue -- add` for the executor to carry out.
 *
 * What Jev is asked, by market:
 *   grants (Optimism)   "approved" or "not approved", given the proposal as the poll lists it (title, amount, what it
 *                       delivered), its live ballot counts and the approval rule. Invalid gets a fixed 3%.
 *   side events         the range the answer will fall in (rating 0-10: below 5, 5-6, ... 9-10; attendance: 25 wide),
 *   Clément films       Clément's published scores from sessions 1 and 2 included (percentile: 20 wide). The scores
 *                       become an expected answer; UP gets the expected payout fraction and DOWN the rest, less 3% for
 *                       Invalid (the skill's section on scalar markets).
 * Jev is never shown the market's price: its estimate is its own, and the price comes in only at the blend.
 *
 * A market the wallet already holds is still asked about and reported, but not traded again: this bot neither adds to
 * nor unwinds a position. Cash is spent in the order of the list, and a trade that would overdraw it is skipped.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { marketFactoryAbi } from "./abis.js";
import { parseArgs } from "./args.js";
import { classify, type ClassifyResult } from "./classifier.js";
import { getPublicClient } from "./clients.js";
import { parseChainId, SEER_ADDRESSES } from "./config.js";
import { erc20FullAbi } from "./dex.js";
import { readMarket } from "./market-view.js";
import { fetchSeerMarket } from "./seer-api.js";
import { blend, DEFAULT_LADDER, DEFAULT_LIMITS, fadeLadder, ladder, planTrade, snapshot, type MarketSnapshot, type SizedTrade, type SizingLimits } from "./trade.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const dryRun = !!args["dry-run"];
const chainId = parseChainId((args.chain as string | undefined) ?? process.env.PASS_CHAIN ?? process.env.CHAIN_ID);
const home = Number(chainId) === Number(process.env.CHAIN_ID ?? 10);
const scope = String(process.env["PASS_MARKET_LIST_" + chainId] ?? (home ? process.env.PASS_MARKET_LIST : "") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => isAddress(s, { strict: false }));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const passDir = process.env.PASS_DIR ?? path.join(ROOT, ".passes", "jev-manual-" + stamp + (home ? "" : "-chain" + chainId));
mkdirSync(passDir, { recursive: true });
const reportPath = process.env.PASS_REPORT ?? path.join(passDir, "report.md");
const audit = path.join(passDir, "classifier-requests.jsonl");
const weight = Number(process.env.JEV_WEIGHT ?? 0.25);
const INVALID = 0.03;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const client = getPublicClient(chainId);

if (!process.env.LIQUIDITY_WALLET || !isAddress(process.env.LIQUIDITY_WALLET, { strict: false })) {
  console.error("LIQUIDITY_WALLET is not set: the Jev pass needs its wallet (MODELS.md).");
  process.exit(2);
}
const wallet = getAddress(process.env.LIQUIDITY_WALLET);

// ---------------------------------------------------------------- public facts, gathered once per pass

/** The live grants round on the Valar vote chain: its proposals with their ballot counts, by normalized name. */
interface Proposal { title: string; description: string; options: Array<{ label: string; ballot_count?: number }> }
async function liveGrantBallots(): Promise<{ byName: Map<string, Proposal>; totalBallots: number; closes?: string } | undefined> {
  try {
    const cfg = await (await fetch("https://voting.valargroup.org/prod/dynamic-voting-config.json", { signal: AbortSignal.timeout(40_000) })).text();
    for (const id of [...new Set(cfg.match(/[0-9a-f]{64}/g) ?? [])]) {
      const r = await fetch("https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/" + id, { signal: AbortSignal.timeout(30_000) }).catch(() => undefined);
      if (!r?.ok) continue;
      const d = (await r.json()) as { status?: number; proposals?: Proposal[]; vote_end_time?: number };
      if (d.status !== 1 || (d.proposals?.length ?? 0) < 20) continue;
      const byName = new Map<string, Proposal>();
      for (const p of d.proposals!) byName.set(norm(p.title.split(/\s[—–-]\s\$/)[0]), p);
      const totalBallots = d.proposals!.reduce((a, p) => a + p.options.filter((o) => !/abstain/i.test(o.label)).reduce((b, o) => b + (o.ballot_count ?? 0), 0), 0);
      return { byName, totalBallots, closes: d.vote_end_time ? new Date(d.vote_end_time * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : undefined };
    }
  } catch {
    /* the pass goes on without ballots and says so */
  }
  return undefined;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Clément's published scores (his Criticker percentile, the market's closing estimate in brackets), from
// https://blog.kleros.io/what-the-first-foresight-experiment-taught-us-about-predicting-clements-movie-taste/ and
// https://blog.kleros.io/the-market-won-this-time-season-2-of-the-foresight-movie-experiment/
const CLEMENT_HISTORY =
  "Session 1: 12 Angry Men 27 (71), Alien 23 (70), Bacurau 30 (67), Judge Dredd 37 (54), Demolition Man 76 (61). " +
  "Session 2, from films he had picked as candidates himself: Ghost in the Shell 87 (81), Cloud Atlas 80 (73), The Big Short 62 (72), Heretic 22 (54), The Menu 51 (63).";

const SIDE_EVENTS = "Arcade / Bowling Night, Marble Race Game, Murder Mystery Game, Networking Dinner, Tuk-Tuk Street Food & Cocktail Night, Go-Karting, The Last Mile of a Prediction Market";

// ---------------------------------------------------------------- what Jev is asked

interface Bin { label: string; value: number }
const RATING_BINS: Bin[] = [
  { label: "a mean rating below 5 out of 10", value: 4 },
  { label: "a mean rating between 5 and 6", value: 5.5 },
  { label: "a mean rating between 6 and 7", value: 6.5 },
  { label: "a mean rating between 7 and 8", value: 7.5 },
  { label: "a mean rating between 8 and 9", value: 8.5 },
  { label: "a mean rating between 9 and 10", value: 9.5 },
];
const ATTENDANCE_BINS: Bin[] = [
  { label: "fewer than 25 attendees", value: 15 },
  { label: "25 to 50 attendees", value: 37.5 },
  { label: "50 to 75 attendees", value: 62.5 },
  { label: "75 to 100 attendees", value: 87.5 },
  { label: "100 to 125 attendees", value: 112.5 },
  { label: "125 attendees or more", value: 140 },
];
const PERCENTILE_BINS: Bin[] = [
  { label: "a percentile score from 0 to 20", value: 10 },
  { label: "a percentile score from 20 to 40", value: 30 },
  { label: "a percentile score from 40 to 60", value: 50 },
  { label: "a percentile score from 60 to 80", value: 70 },
  { label: "a percentile score from 80 to 100", value: 90 },
];

interface Ask { kind: string; state: string; labels: string[]; instructions: string; bins?: Bin[] }

function grantAsk(snap: MarketSnapshot, question: string, ballots: Awaited<ReturnType<typeof liveGrantBallots>>): Ask {
  const name = question.match(/^Will (.+?) be approved in the/i)?.[1] ?? snap.name;
  const p = ballots?.byName.get(norm(name));
  const counts = p ? p.options.map((o) => o.label + " " + (o.ballot_count ?? 0)).join("; ") : undefined;
  const state = [
    "Zcash Q3 2026 Coinholder-Directed Retroactive Grants: a coinholder poll decides which of 37 retroactive grant proposals are paid. Voting runs 17 to 29 September 2026 on the Valar shielded vote chain. A proposal is approved with a simple majority of the ZEC voting on it and at least about 420,000 ZEC of participation on that proposal, about 2% of the supply.",
    p ? "Proposal: " + p.title + "." : "Proposal: " + name + ".",
    p?.description ? "What it delivered: " + p.description : "",
    counts
      ? "Ballots cast on this proposal so far (counts of ballots, not ZEC-weighted; the ZEC weights stay hidden until the tally): " + counts + ". Ballots across all 37 proposals so far, abstentions excluded: " + ballots!.totalBallots + (ballots!.closes ? ". Voting closes " + ballots!.closes + "." : ".")
      : "Live ballot counts for this proposal could not be read.",
    "Question: " + question,
  ].filter(Boolean).join("\n");
  return { kind: "grant", state, labels: ["approved", "not approved"], instructions: "Decide whether this proposal will be approved when the poll closes." };
}

function sideEventAsk(snap: MarketSnapshot, question: string, rating: boolean): Ask {
  const event = snap.parent?.outcome ?? question.match(/^If (.+?) is held/i)?.[1] ?? "?";
  const state = [
    'Kleros Foresight "DevCon Side Event" decision markets: Kleros will choose one of seven side events to hold at Devcon 8 (Mumbai, 3 to 6 November 2026): ' + SIDE_EVENTS + ". For each event one market forecasts attendance and one the attendees' satisfaction, if that event is the one held.",
    "This event: " + event + ".",
    "Question: " + question + (rating ? " Satisfaction is measured as the attendees' mean rating in the post-event survey." : ""),
  ].join("\n");
  return { kind: rating ? "rating" : "attendance", state, labels: (rating ? RATING_BINS : ATTENDANCE_BINS).map((b) => b.label), instructions: "Pick the range the answer will fall in, if the event is held.", bins: rating ? RATING_BINS : ATTENDANCE_BINS };
}

const clementFilms = new Map<string, string>();
async function clementAsk(snap: MarketSnapshot, question: string): Promise<Ask> {
  const film = snap.parent?.outcome ?? question.match(/assign to (.+?)\?/i)?.[1] ?? "?";
  if (snap.parent && !clementFilms.has(snap.parent.market)) {
    const parent = await readMarket(client, chainId, snap.parent.market).catch(() => undefined);
    clementFilms.set(snap.parent.market, parent ? parent.outcomes.filter((o) => !/^invalid/i.test(o)).join(", ") : "");
  }
  const films = snap.parent ? clementFilms.get(snap.parent.market) : "";
  const state = [
    'Kleros Foresight "Distilled Clement\'s Judgement", session 3: Clement, Kleros\'s CTO, will watch 5 of 20 films (the top 3 by the markets\' closing estimates, 1 drawn at random, 1 of his own choice) and rate each on Criticker, which gives a percentile score from 0 to 100 against everything he has rated.' + (films ? " Session 3 films: " + films + "." : ""),
    "His scores so far (his percentile, the market's closing estimate in brackets): " + CLEMENT_HISTORY,
    "This film: " + film + ".",
    "Question: what percentile score would Clement give " + film + " if he watches it?",
  ].join("\n");
  return { kind: "percentile", state, labels: PERCENTILE_BINS.map((b) => b.label), instructions: "Pick the range his score will fall in, if he watches the film.", bins: PERCENTILE_BINS };
}

/** Jev's answer as one probability per outcome of the market, Invalid included; undefined when it cannot be mapped. */
function estimate(snap: MarketSnapshot, ask: Ask, res: ClassifyResult): number[] | undefined {
  if (!res.scores) return undefined;
  const total = ask.labels.reduce((a, l) => a + (res.scores![l] ?? 0), 0);
  if (!(total > 0)) return undefined;
  const p = (l: string) => (res.scores![l] ?? 0) / total;
  const own = snap.outcomes.map(() => 0);
  const inv = snap.outcomes.findIndex((o) => /^invalid/i.test(o));
  if (ask.kind === "grant") {
    const yes = snap.outcomes.findIndex((o) => /^yes$/i.test(o));
    const no = snap.outcomes.findIndex((o) => /^no$/i.test(o));
    if (yes < 0 || no < 0) return undefined;
    own[yes] = p("approved") * (1 - INVALID);
    own[no] = p("not approved") * (1 - INVALID);
  } else {
    const down = snap.outcomes.findIndex((o) => /^down$/i.test(o));
    const up = snap.outcomes.findIndex((o) => /^up$/i.test(o));
    if (down < 0 || up < 0 || !snap.scalar || !ask.bins) return undefined;
    const lo = Number(formatUnits(snap.scalar.lower, 18));
    const hi = Number(formatUnits(snap.scalar.upper, 18));
    const expected = ask.bins.reduce((a, b) => a + p(b.label) * b.value, 0);
    const f = Math.min(1, Math.max(0, (expected - lo) / (hi - lo)));
    own[up] = f * (1 - INVALID);
    own[down] = (1 - f) * (1 - INVALID);
  }
  if (inv >= 0) own[inv] = INVALID;
  return own;
}

// ---------------------------------------------------------------- the pass

const pct = (x: number) => (x * 100).toFixed(1) + "%";
const report: string[] = [];
let cash = 0;
let collateralSymbol = "collateral";
try {
  const collateral = (await client.readContract({ address: SEER_ADDRESSES[chainId].MarketFactory, abi: marketFactoryAbi, functionName: "collateralToken" })) as Address;
  cash = Number(formatUnits(await client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [wallet] }), 18));
  collateralSymbol = await client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "symbol" });
} catch (e) {
  console.error("could not read the wallet's cash: " + (e as Error).message.split("\n")[0]);
  process.exit(1);
}
const startingCash = cash;
const ballots = home ? await liveGrantBallots() : undefined;

report.push("# Jev pass, chain " + chainId + ", " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
report.push("");
report.push("Model: Jev (TypeSafe's System One decision model) through classifier.dev, fast tier. Blend weight " + weight + " for Jev against the market; quarter Kelly; at most " + DEFAULT_LIMITS.maxPerMarket * 100 + "% of the bankroll per market; fills at most " + DEFAULT_LIMITS.maxSlippage * 100 + "% worse than spot; edge of at least " + DEFAULT_LIMITS.minEdge * 100 + " points on the fill. Cash " + cash.toFixed(2) + " " + collateralSymbol + ". Every request sent to classifier.dev is in classifier-requests.jsonl beside this report.");
if (home) report.push(ballots ? "Grant ballots read live from the Valar vote chain: " + ballots.totalBallots + " non-abstain ballots so far." : "Grant ballots could not be read this pass; Jev was asked without them.");
report.push("");

let answered = 0;
let queued = 0;
for (const market of scope) {
  const address = getAddress(market);
  const block: string[] = [];
  try {
    const snap = await snapshot(client, chainId, address);
    const api = await fetchSeerMarket(chainId, address).catch(() => undefined);
    const question = (api?.encodedQuestions?.[0] ?? snap.name).split("␟")[0];
    block.push("## " + snap.name);
    block.push("https://app.seer.pm/markets/" + chainId + "/" + address);
    if (snap.payoutReported) {
      block.push("resolved already: nothing to decide (the executor redeems it)");
      report.push(...block, "");
      continue;
    }
    let ask: Ask | undefined;
    if (/percentile score will Cl/i.test(snap.name)) ask = await clementAsk(snap, question);
    else if (/is held, how many unique/i.test(question)) ask = sideEventAsk(snap, question, false);
    else if (/is held, what will the attendees/i.test(question)) ask = sideEventAsk(snap, question, true);
    else if (/Coinholder-Directed Retroactive Grants poll/i.test(question)) ask = grantAsk(snap, question, ballots);
    if (!ask) {
      block.push("no fact recipe for this kind of market: not asked, no trade");
      report.push(...block, "");
      continue;
    }
    const res = await classify({ labels: ask.labels, input: ask.state, instructions: ask.instructions }, audit);
    answered++;
    const own = estimate(snap, ask, res);
    block.push("FACTS SENT  " + ask.state.replace(/\n/g, " / ").slice(0, 600) + (ask.state.length > 600 ? " ..." : ""));
    block.push("JEV         " + res.label + (res.confidence !== null ? " (confidence " + res.confidence.toFixed(2) + ")" : "") + "   scores: " + (res.scores ? ask.labels.map((l) => l + " " + (res.scores![l] ?? 0).toFixed(3)).join(", ") : "none") + "   model " + (res.model ?? "?"));
    if (!own) {
      block.push("its answer could not be turned into outcome probabilities: no trade");
      report.push(...block, "");
      continue;
    }
    const blended = blend(own, snap.implied, weight);
    block.push("ESTIMATE    " + snap.outcomes.map((o, i) => o + " " + pct(own[i])).join(", "));
    block.push("MARKET      " + snap.outcomes.map((o, i) => o + " " + (snap.spot[i] === undefined ? "no pool" : pct(snap.implied[i]))).join(", "));
    block.push("BLENDED     " + snap.outcomes.map((o, i) => o + " " + pct(blended[i])).join(", ") + "   (Jev at weight " + weight + ")");

    // a position already held is reported, not traded again
    let holding = false;
    for (const p of snap.pools) if ((await client.readContract({ address: p.token, abi: erc20FullAbi, functionName: "balanceOf", args: [wallet] })) > 0n) holding = true;
    if (!snap.tradeable) {
      block.push("TRADE       none: no live liquidity in this market's pools");
    } else if (holding) {
      block.push("TRADE       none: the wallet already holds a position here, and this bot neither adds to nor unwinds one");
    } else {
      const limits: SizingLimits = { ...DEFAULT_LIMITS, bankroll: cash };
      const candidates: SizedTrade[] = [];
      for (const p of snap.pools) {
        if (!p.exists) continue;
        const edge = blended[p.index] - (snap.spot[p.index] ?? 0);
        if (edge > 0) {
          const { trade } = planTrade(await ladder(client, snap, p.index, blended, limits, DEFAULT_LADDER), blended, p.index, limits);
          if (trade) candidates.push(trade);
        }
        if (-edge >= limits.minEdge / 2) {
          const { trade } = planTrade(await fadeLadder(client, snap, p.index, blended, limits, DEFAULT_LADDER), blended, p.index, limits);
          if (trade) candidates.push(trade);
        }
      }
      // buying one side and selling the other are the same view: take the single best, never both
      const best = candidates.sort((a, b) => b.ev - a.ev)[0];
      if (!best) {
        block.push("TRADE       none: nothing clears the edge, slippage and Kelly limits");
      } else {
        const stake = Number(formatUnits(best.collateralIn, 18));
        const sets = Number(formatUnits(best.tokensOut, 18));
        // what leaves the wallet up front: the stake for a swap, the whole complete sets for a split or a fade
        const needed = best.kind === "direct" ? stake : sets;
        const size = (best.kind === "direct" ? stake : sets).toFixed(4);
        const what = (best.kind === "fade" ? "sell short " : "buy ") + snap.outcomes[best.targetIndex] + " via " + best.kind;
        if (needed > cash) {
          block.push("TRADE       none: " + what + " needs " + needed.toFixed(2) + " " + collateralSymbol + " up front and " + cash.toFixed(2) + " is left this pass");
        } else {
          const note = "Jev " + res.label + (res.confidence !== null ? " " + res.confidence.toFixed(2) : "") + "; blended " + pct(best.winProb) + " vs fill " + best.avgPrice.toFixed(3) + ", EV +" + best.ev.toFixed(2);
          block.push("TRADE       " + what + ", size " + size + ": stake " + stake.toFixed(2) + " for " + sets.toFixed(2) + " tokens at " + best.avgPrice.toFixed(4) + ", " + (snap.scalar ? "E[payout] " : "p(win) ") + pct(best.winProb) + ", edge " + ((best.winProb - best.avgPrice) * 100).toFixed(1) + " pts, EV +" + best.ev.toFixed(2) + ", limited by " + best.limitedBy);
          if (dryRun) {
            block.push("            (dry run: not queued)");
          } else {
            const q = spawnSync(npmCmd, ["run", "-s", "queue", "--", "add", address, "--chain", String(chainId), "--outcome", String(best.targetIndex), "--route", best.kind, "--size", size, "--note", note], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: process.env });
            const out = ((q.stdout ?? "") + (q.stderr ?? "")).trim();
            block.push("            " + (q.status === 0 ? "queued: " : "NOT queued (exit " + q.status + "): ") + out.split("\n")[0]);
            if (q.status === 0) {
              queued++;
              cash -= needed;
            }
          }
        }
      }
    }
  } catch (e) {
    block.push("ERROR       " + (e as Error).message.split("\n")[0]);
  }
  report.push(...block, "");
  console.log(block.slice(0, 1).concat(block.filter((l) => l.startsWith("TRADE") || l.startsWith("ERROR") || l.startsWith("JEV"))).join("\n"));
}

report.splice(4, 0, "Summary: " + answered + " of " + scope.length + " markets answered by Jev, " + queued + " trade(s) queued" + (dryRun ? " (dry run: none queued)" : "") + ", " + (startingCash - cash).toFixed(2) + " " + collateralSymbol + " committed.", "");
writeFileSync(reportPath, report.join("\n"));
console.log("report: " + reportPath);
// a pass in which Jev answered nothing did not happen: the cycle runner redoes it
process.exit(answered > 0 || scope.length === 0 ? 0 : 1);
