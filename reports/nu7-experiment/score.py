"""
Settles and scores the NU7 four-model experiment against the official ZEC-weighted tally.

    python reports/nu7-experiment/score.py

Inputs (all in this folder unless noted):
  onchain.json   pool seed/swap history, wallet balances, gas receipts, ETH/USD, sUSDS rate (onchain.ts)
  tally.json     Valar vote-chain summary after decryption: ballot counts and ZEC-weighted totals
  bot folders    C:/Users/12/Desktop/bots/<model>/.passes/*/report.md and .queue/executed.jsonl (+ trade logs)

Writes scores.json. Definitions used throughout:
  forecast vector   probabilities over the market's real outcomes, Invalid dropped, renormalized to sum to 1
                    (pool prices do not price Invalid, so every forecaster is scored on the same outcome set)
  accuracy          1 when the forecaster's most likely outcome won, else 0; averaged over the five markets
  Brier             sum over outcomes of (p - result)^2, 0 perfect, 2 worst; averaged over the five markets
  log loss          -ln(p of the outcome that won); averaged over the five markets
  P&L               winning tokens x 1 sUSDS - net sUSDS paid for the positions - gas (receipts, in sUSDS)
"""
import datetime as dt
import glob
import json
import math
import os
import re
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
BOTS_ROOT = r"C:\Users\12\Desktop\bots"
MODELS = ["fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"]
NAMES = {"fable-5.1": "Claude Fable 5.1", "opus-5": "Claude Opus 5", "astra-gpt-6": "GPT-6 Astra", "gpt-5.6-sol": "GPT-5.6 Sol"}
MARKETS = ["zip218", "smoothing", "features", "v4", "reissuance"]
PROPOSAL = {1: "smoothing", 2: "reissuance", 3: "v4", 4: "zip218", 5: "features"}
EXP_START = "2026-09-13T16:30:00Z"
POLL_CLOSE = "2026-09-14T19:00:00Z"
ZEC_PER_UNIT = 0.125  # tally total_value units: 19,007,459 units = 2,375,932.375 ZEC on cipherscan.app

def ts(s):
    return dt.datetime.strptime(s.replace("Z", ""), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.UTC).timestamp()

def iso(t):
    return dt.datetime.fromtimestamp(t, dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

oc = json.load(open(os.path.join(HERE, "onchain.json"), encoding="utf-8"))
tally = json.load(open(os.path.join(HERE, "tally.json"), encoding="utf-8"))
M = oc["markets"]
REAL = {k: [i for i in range(len(M[k]["outcomes"])) if i != M[k]["invalidIndex"]] for k in MARKETS}

# ---------------------------------------------------------------- the result
results = {}
for p in tally["proposals"]:
    k = PROPOSAL[p["id"]]
    opts = [o for o in p["options"] if not o["label"].lower().startswith("abstain")]
    abstain = next(o for o in p["options"] if o["label"].lower().startswith("abstain"))
    outs = [M[k]["outcomes"][i] for i in REAL[k]]
    assert len(opts) == len(outs), k
    for o, name in zip(opts, outs):  # poll options and market outcomes are listed in the same order
        a, b = re.sub(r"[^a-z0-9]", "", o["label"].lower())[:3], re.sub(r"[^a-z0-9]", "", name.lower())[:3]
        assert a == b, (k, o["label"], name)
    zec = [o["total_value"] * ZEC_PER_UNIT for o in opts]
    ballots = [o["ballot_count"] for o in opts]
    w = max(range(len(opts)), key=lambda i: zec[i])
    total_zec = sum(zec) + abstain["total_value"] * ZEC_PER_UNIT
    results[k] = dict(question=p["title"], winner=REAL[k][w], winnerLabel=M[k]["outcomes"][REAL[k][w]], options=[o["label"].rstrip(".") for o in opts],
                      zec=zec, zecShare=[z / sum(zec) for z in zec], zecShareInclAbstain=[z / total_zec for z in zec], totalZec=total_zec, abstainZec=abstain["total_value"] * ZEC_PER_UNIT,
                      ballots=ballots, ballotShare=[b / sum(ballots) for b in ballots], abstainBallots=abstain["ballot_count"])

# ---------------------------------------------------------------- pool price history (onchain)
hist = {}
for e in oc["events"]:
    if e["kind"] in ("Initialize", "Swap"):
        hist.setdefault((e["market"], e["index"]), []).append((e["ts"], e["price"], e["kind"], e.get("from")))
for v in hist.values():
    v.sort(key=lambda x: x[0])

def price_at(k, i, t):
    last = None
    for (et, p, _, _) in hist[(k, i)]:
        if et <= t:
            last = p
        else:
            break
    return last

def market_vector(k, t):
    raw = [price_at(k, i, t) for i in REAL[k]]
    s = sum(raw)
    return [x / s for x in raw], raw

seed = {k: [hist[(k, i)][0][1] for i in REAL[k]] for k in MARKETS}
wallets = {v.lower(): n for n, v in oc["wallets"].items()}
bot_swaps = sorted(e["ts"] for e in oc["events"] if e["kind"] == "Swap" and e.get("from") in wallets and e["ts"] >= ts(EXP_START))
first_bot_trade = bot_swaps[0]
last_swap = max(e["ts"] for e in oc["events"] if e["kind"] == "Swap")
burns = [e["ts"] for e in oc["events"] if e["kind"] == "Burn"]
liquidity_withdrawn = max(burns)

# ---------------------------------------------------------------- agent estimates, full vectors
PATTERNS = {
    "zip218": [(2, r"invalid|^i$"), (1, r"^no\b|^n$"), (0, r"yes|^y$")],
    "smoothing": [(3, r"invalid|^i$"), (2, r"not.?include|do not|not.?in|exclude|omit|defer|none"), (1, r"preserve|halving"), (0, r"smooth")],
    "features": [(3, r"invalid|^i$"), (2, r"not.?support|reject|oppose|do not"), (1, r"delay"), (0, r"ship")],
    "v4": [(3, r"invalid|^i$"), (2, r"no.?date|do not set"), (1, r"year"), (0, r"immediate")],
    "reissuance": [(3, r"invalid|^i$"), (2, r"2031"), (1, r"2027"), (0, r"asap|soon")],
}
CLASSIFY = [("features", r"\bship\b"), ("v4", r"immediate"), ("reissuance", r"2031"), ("smoothing", r"smooth|preserve|halving"), ("zip218", r"\byes\b|\by/n")]
CUT = re.compile(r"\(|would change|reasoning|blended|\u2014|\ufffd|rechecked", re.I)
NUM = r"(?<![\d.])(\d?\.\d+)(?!\d)"

def label_index(k, label):
    lab = label.strip().strip("*.").strip().lower()
    for idx, pat in PATTERNS[k]:
        if re.search(pat, lab):
            return idx
    return None

def parse_estimate(line):
    s = line.replace("**", "")
    s = re.sub(r"^\s*ESTIMATE\s*", "", s, flags=re.I)
    s = CUT.split(s)[0]
    low = s.lower()
    k = next((key for key, pat in CLASSIFY if re.search(pat, low)), None)
    if not k:
        return None, None, "unclassified"
    vec = {}
    g = re.search(r"(\d?\.\d+(?:\s*/\s*\d?\.\d+)+)", s)
    if g:  # "Smooth/Preserve/Exclude/Invalid .10/.70/.15/.05"
        before = s[: g.start()].rstrip(" :*")
        labels = before.split()[-1].split("/") if before.split() else []
        values = [float(x) for x in re.findall(r"\d?\.\d+", g.group(1))]
        if len(labels) == len(values):
            for lab, val in zip(labels, values):
                idx = label_index(k, lab)
                if idx is not None and idx not in vec:
                    vec[idx] = val
    if not vec:  # "Yes 0.95, No 0.03, Invalid 0.02" and every variant of separators
        prev = 0
        for m in re.finditer(NUM, s):
            segs = [x for x in re.split(r"[,|:;/]", s[prev: m.start()]) if x.strip(" *.")]
            prev = m.end()
            if not segs:
                continue
            idx = label_index(k, segs[-1])
            if idx is not None and idx not in vec:
                vec[idx] = float(m.group(1))
    n = len(M[k]["outcomes"])
    inv = M[k]["invalidIndex"]
    if any(i not in vec for i in REAL[k]):
        return k, None, "missing outcome " + str([i for i in REAL[k] if i not in vec]) + " in: " + s[:120]
    full = [vec.get(i, 0.0) for i in range(n)]
    if not 0.94 <= sum(full) <= 1.06:
        return k, None, "sum %.3f in: %s" % (sum(full), s[:120])
    return k, full, None

passes = {m: [] for m in MODELS}
problems = []
for m in MODELS:
    for d in sorted(glob.glob(os.path.join(BOTS_ROOT, m, ".passes", "2026-*"))):
        b = os.path.basename(d)
        started = b[:10] + "T" + b[11:13] + ":" + b[14:16] + ":" + b[17:19] + "Z"
        rp = os.path.join(d, "report.md")
        if started < EXP_START or not os.path.isfile(rp):
            continue
        try:
            res = json.load(open(os.path.join(d, "result.json"), encoding="utf-8"))
        except Exception:
            res = {}
        finished = res.get("finishedAt")
        t_done = ts(finished[:19] + "Z") if finished else ts(started) + 20 * 60
        est = {}
        for line in open(rp, encoding="utf-8", errors="replace").read().replace("\r", "").split("\n"):
            if not re.match(r"^\W*ESTIMATE\b", line.strip(), re.I):
                continue
            k, vec, err = parse_estimate(line)
            if err:
                problems.append((m, started, err))
                continue
            est.setdefault(k, vec)
        if est:
            passes[m].append(dict(started=started, finished=iso(t_done), t=t_done, status=res.get("status"), cash=res.get("cash"), est=est))

def renorm(k, full):
    v = [full[i] for i in REAL[k]]
    s = sum(v)
    return [x / s for x in v]

def final_estimates(m):
    out = {}
    for p in passes[m]:
        if p["t"] <= ts(POLL_CLOSE):
            for k, v in p["est"].items():
                out[k] = (p["started"], v)
    return out

# ---------------------------------------------------------------- scoring
def score_vec(k, v):
    w = REAL[k].index(results[k]["winner"])
    top = max(v)
    winners_at_top = [i for i, x in enumerate(v) if abs(x - top) < 1e-12]
    acc = (1.0 / len(winners_at_top)) if w in winners_at_top else 0.0
    brier = sum((x - (1.0 if i == w else 0.0)) ** 2 for i, x in enumerate(v))
    ll = -math.log(max(v[w], 1e-6))
    return dict(pWinner=v[w], accuracy=acc, brier=brier, logloss=ll, argmax=REAL[k][v.index(top)], vector=v)

def score_forecaster(name, kind, when, vectors, note=""):
    per = {k: score_vec(k, vectors[k]) for k in MARKETS}
    return dict(name=name, kind=kind, when=when, note=note, perMarket=per,
                accuracy=statistics.mean(per[k]["accuracy"] for k in MARKETS),
                brier=statistics.mean(per[k]["brier"] for k in MARKETS),
                logloss=statistics.mean(per[k]["logloss"] for k in MARKETS))

forecasters = []
agent_final = {}
for m in MODELS:
    fe = final_estimates(m)
    agent_final[m] = {k: renorm(k, fe[k][1]) for k in MARKETS}
    last = max(fe[k][0] for k in MARKETS)
    forecasters.append(score_forecaster(NAMES[m], "agent", last, agent_final[m], "final estimate before the poll closed"))
mean_vec = {k: [statistics.mean(agent_final[m][k][i] for m in MODELS) for i in range(len(REAL[k]))] for k in MARKETS}
forecasters.append(score_forecaster("Mean of the four agents", "agents-mean", "final estimates", mean_vec, "simple average of the four final vectors"))
forecasters.append(score_forecaster("Opening price (pool seed)", "base", iso(hist[("zip218", 0)][0][0]), {k: [x / sum(seed[k]) for x in seed[k]] for k in MARKETS}, "creator's seed prices, before any trade"))
forecasters.append(score_forecaster("Market before the bots traded", "base", iso(first_bot_trade - 1), {k: market_vector(k, first_bot_trade - 1)[0] for k in MARKETS}, "pool prices one second before the experiment's first swap"))
forecasters.append(score_forecaster("Market final price", "market", iso(ts(POLL_CLOSE)), {k: market_vector(k, ts(POLL_CLOSE))[0] for k in MARKETS}, "pool prices at the poll close (unchanged since the last swap)"))
forecasters.append(score_forecaster("Live ballot share (reference)", "reference", iso(ts(POLL_CLOSE)), {k: results[k]["ballotShare"] for k in MARKETS}, "share of ballots ex-abstain; public signal, not a trader's forecast"))

# robustness: agents scored without dropping their Invalid mass (Invalid counted as a losing outcome)
robust = {}
for m in MODELS:
    fe = final_estimates(m)
    br, ll = [], []
    for k in MARKETS:
        full = fe[k][1]
        w = results[k]["winner"]
        br.append(sum((x - (1.0 if i == w else 0.0)) ** 2 for i, x in enumerate(full)))
        ll.append(-math.log(max(full[w], 1e-6)))
    robust[m] = dict(brier=statistics.mean(br), logloss=statistics.mean(ll))

# ---------------------------------------------------------------- scores over time
series = {"grid": [], "agents": {m: [] for m in MODELS}, "market": [], "seed": None, "pre": None}
t = ts("2026-09-13T17:00:00Z")
while t <= ts(POLL_CLOSE):
    series["grid"].append(iso(t))
    mv = {k: market_vector(k, t)[0] for k in MARKETS}
    series["market"].append(dict(brier=statistics.mean(score_vec(k, mv[k])["brier"] for k in MARKETS), logloss=statistics.mean(score_vec(k, mv[k])["logloss"] for k in MARKETS)))
    for m in MODELS:
        latest = {}
        for p in passes[m]:
            if p["t"] <= t:
                for k, v in p["est"].items():
                    latest[k] = v
        if all(k in latest for k in MARKETS):
            vs = {k: renorm(k, latest[k]) for k in MARKETS}
            series["agents"][m].append(dict(brier=statistics.mean(score_vec(k, vs[k])["brier"] for k in MARKETS), logloss=statistics.mean(score_vec(k, vs[k])["logloss"] for k in MARKETS)))
        else:
            series["agents"][m].append(None)
    t += 3600
series["seed"] = next(f for f in forecasters if f["name"].startswith("Opening"))["brier"]
series["pre"] = next(f for f in forecasters if f["name"].startswith("Market before"))["brier"]

# ---------------------------------------------------------------- P&L
usds_per_susds = oc["susdsRate"]["usdsPerSusds"]
eth_usd = oc["ethUsd"]["price"]
pnl = {}
for m in MODELS:
    wallet = oc["wallets"][m]
    cost = {k: 0.0 for k in MARKETS}
    trades = []
    for line in open(os.path.join(BOTS_ROOT, m, ".queue", "executed.jsonl"), encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("kind") == "unwind" or r["createdAt"] < EXP_START or r["status"] != "done":
            continue
        k = next(key for key in MARKETS if M[key]["address"].lower() == r["market"].lower())
        text = open(r["log"], encoding="utf-8", errors="replace").read() if r.get("log") and os.path.isfile(r["log"]) else ""
        g = re.search(r"sUSDS\s+([\d.]+)\s+\(was ([\d.]+)\)", text)
        if g:
            c, source = float(g.group(2)) - float(g.group(1)), "wallet balance before/after in the trade log"
        elif r["route"] == "direct":
            c, source = float(r["size"]), "direct swap of exactly the queued size (receipt read refused; position verified onchain)"
        else:
            raise SystemExit("no cost for " + r["id"])
        cost[k] += c
        trades.append(dict(id=r["id"], market=k, route=r["route"], outcome=r["outcome"], size=r["size"], cost=c, costSource=source))
    start_cash = passes[m][0]["cash"]
    cash_now = int(oc["cash"][m]) / 1e18
    payoff = {k: int(oc["balances"][m][k][results[k]["winner"]]) / 1e18 for k in MARKETS}
    holdings = {k: {M[k]["outcomes"][i]: int(b) / 1e18 for i, b in enumerate(oc["balances"][m][k]) if int(b) > 0} for k in MARKETS}
    fee_wei = sum(int(f["feeWei"]) for f in oc["fees"] if f["bot"] == m)
    gas_eth = fee_wei / 1e18
    gas_usd = gas_eth * eth_usd
    gas_susds = gas_usd / usds_per_susds
    total_cost = sum(cost.values())
    total_payoff = sum(payoff.values())
    net = total_payoff - total_cost - gas_susds
    pnl[m] = dict(name=NAMES[m], wallet=wallet, startCash=start_cash, cashNow=cash_now, cashCheck=start_cash - cash_now - total_cost,
                  cost=total_cost, payoff=total_payoff, gasEth=gas_eth, gasUsd=gas_usd, gasSusds=gas_susds, gasTxs=sum(1 for f in oc["fees"] if f["bot"] == m),
                  net=net, netUsd=net * usds_per_susds, returnOnCost=net / total_cost, returnOnBankroll=net / start_cash,
                  perMarket={k: dict(cost=cost[k], payoff=payoff[k], net=payoff[k] - cost[k]) for k in MARKETS}, holdings=holdings, trades=trades)

out = dict(
    generatedAt=iso(dt.datetime.now(dt.UTC).timestamp()), onchainCollectedAt=oc["collectedAt"], pollClose=POLL_CLOSE,
    firstBotTrade=iso(first_bot_trade), lastSwap=iso(last_swap), liquidityWithdrawn=iso(liquidity_withdrawn),
    oracle={k: M[k]["oracle"] for k in MARKETS}, payoutReported={k: M[k]["payoutReported"] for k in MARKETS},
    usdsPerSusds=usds_per_susds, ethUsd=eth_usd, results=results, real={k: [M[k]["outcomes"][i] for i in REAL[k]] for k in MARKETS},
    forecasters=forecasters, robustness=robust, series=series, pnl=pnl,
    agentPasses={m: [dict(started=p["started"], finished=p["finished"], est={k: v for k, v in p["est"].items()}) for p in passes[m]] for m in MODELS},
    priceHistory={k + ":" + str(i): [(iso(a), b, c, wallets.get(d, d)) for (a, b, c, d) in hist[(k, i)]] for (k, i) in hist},
    parseProblems=problems,
)
json.dump(out, open(os.path.join(HERE, "scores.json"), "w", encoding="utf-8"), indent=1)

# ---------------------------------------------------------------- console summary
print("RESULT")
for k in MARKETS:
    r = results[k]
    wi = REAL[k].index(r["winner"])
    print("  %-10s %-48s ZEC %.2f%%  ballots %.1f%%" % (k, r["winnerLabel"][:48], 100 * r["zecShare"][wi], 100 * r["ballotShare"][wi]))
print("\nfirst bot trade %s   last swap %s   liquidity withdrawn %s" % (iso(first_bot_trade), iso(last_swap), iso(liquidity_withdrawn)))
print("\nPASSES parsed:", {m: len(passes[m]) for m in MODELS}, " problems:", len(problems))
for pr in problems:
    print("   ", pr)
print("\nSCORES (final forecasts; Invalid dropped and renormalized)")
print("  %-34s %-20s %8s %8s %8s   p(winner) by market %s" % ("forecaster", "when", "accuracy", "Brier", "logloss", MARKETS))
for f in forecasters:
    print("  %-34s %-20s %8.2f %8.4f %8.4f   %s" % (f["name"], f["when"], f["accuracy"], f["brier"], f["logloss"], " ".join("%.3f" % f["perMarket"][k]["pWinner"] for k in MARKETS)))
print("  robustness (agents, Invalid kept):", {m: {x: round(y, 4) for x, y in v.items()} for m, v in robust.items()})
print("\nP&L (sUSDS; USD at %.4f USDS per sUSDS; gas at ETH $%.2f)" % (usds_per_susds, eth_usd))
for m in MODELS:
    p = pnl[m]
    print("  %-17s cost %8.4f  payoff %8.4f  gas %.2e ETH ($%.4f, %d txs)  net %+9.4f (%+.2f USD)  on cost %+.1f%%  on bankroll %+.2f%%  cash check %.4f" % (
        p["name"], p["cost"], p["payoff"], p["gasEth"], p["gasUsd"], p["gasTxs"], p["net"], p["netUsd"], 100 * p["returnOnCost"], 100 * p["returnOnBankroll"], p["cashCheck"]))
    print("      " + "  ".join("%s %+.2f" % (k, v["net"]) for k, v in p["perMarket"].items() if v["cost"] or v["payoff"]))
tot_net = sum(pnl[m]["net"] for m in MODELS)
print("  TOTAL net %+.4f sUSDS (%+.2f USD) on cost %.4f" % (tot_net, tot_net * usds_per_susds, sum(pnl[m]["cost"] for m in MODELS)))
print("\nBrier over time (hourly): market %s" % " ".join("%.3f" % x["brier"] for x in series["market"]))
for m in MODELS:
    print("  %-12s %s" % (m, " ".join("  -  " if x is None else "%.3f" % x["brier"] for x in series["agents"][m])))
