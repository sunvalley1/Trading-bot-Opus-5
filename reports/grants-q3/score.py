"""Scores the five bots on the Q3 coinholder retroactive grants round.

Definitions, kept the same as the NU7 deck so the two rounds are comparable:
  forecast      P(Yes) after dropping Invalid and renormalising, because the pools never priced Invalid
  outcome       1 when the proposal was accepted by ZEC weight, 0 when rejected (both reject options count as no)
  Brier         (p - outcome)^2, averaged over the 37 markets: 0 perfect, 1 worst for a binary question
  log loss      -ln(p assigned to what happened), averaged; capped at p in [0.001, 0.999]
  accuracy      1 when the side the forecaster leaned to won, averaged
  calibration   mean forecast minus base rate, so a positive number means systematically too bullish

Estimate sources, last record before the vote closed on 29 Sep 20:00 UTC:
  fable   fleet-grants.json   own vector per market, written by its own build-fleet.py
  astra   estimates.json      own vector per market
  sol     fleet.json          own vector per market
  jev     report.md           "ESTIMATE Yes x%, No y%, Invalid z%" per market block
  opus    queue notes         its own estimate at the moment it traded each market: no pass of its own wrote a
                              machine-readable set, so these are trade-time rather than a single final snapshot
  market  report.md (jev)     "MARKET Yes x%, No y%" - the pool's own closing price, scored as a rival forecaster
"""

import glob
import json
import math
import os
import re
import statistics

BOTS = "fable-5.1 opus-5 astra-gpt-6b gpt-5.6-sol jev".split()
HERE = os.path.dirname(os.path.abspath(__file__))
PASSES = r"C:\Users\12\Desktop\bots"
OUT = os.path.join(HERE, "scores.json")


def newest(pattern):
    hits = sorted(glob.glob(pattern))
    return hits[-1] if hits else None


# Folder names are UTC. Voting closed 29 Sep 20:00 UTC and the tally was decrypted within hours, so anything a bot
# wrote after that is hindsight, not a forecast: scoring it gave Sol a Brier of 0.0000 on the first run.
CUTOFF = "2026-09-29T20-00"


def chain10_passes(bot):
    """Chain-10 pass folders that finished before the vote closed, oldest first, excluding the Gnosis ones."""
    out = []
    for d in sorted(glob.glob(os.path.join(PASSES, bot, ".passes", "2026-*"))):
        name = os.path.basename(d)
        if d.endswith("chain100") or name[:16] >= CUTOFF:
            continue
        out.append(d)
    return out


def renorm(y, n):
    """P(Yes) with Invalid dropped: every forecaster is scored on the same two outcomes."""
    total = y + n
    return y / total if total > 0 else 0.5


# ---------------------------------------------------------------- ground truth
tally = json.load(open(os.path.join(HERE, "summary.json"), encoding="utf-8"))
UNIT = 0.125  # one tally unit is 0.125 ZEC
truth = {}
for p in tally["proposals"]:
    acc = sum(o.get("total_value", 0) for o in p["options"] if o["label"].lower().startswith("accept")) * UNIT
    rej = sum(o.get("total_value", 0) for o in p["options"] if o["label"].lower().startswith("reject")) * UNIT
    truth[p["id"]] = dict(title=p["title"], accept=acc, reject=rej, outcome=1 if acc > rej else 0,
                          share=acc / (acc + rej) if acc + rej else 0.0,
                          ballotsAccept=sum(o.get("ballot_count", 0) for o in p["options"] if o["label"].lower().startswith("accept")),
                          ballotsReject=sum(o.get("ballot_count", 0) for o in p["options"] if o["label"].lower().startswith("reject")))

# ---------------------------------------------------------------- markets and the title -> market map
markets = json.load(open(os.path.join(HERE, "markets.json"), encoding="utf-8"))
by_ref = {m["id"].lower(): m for m in markets}


def words(s):
    return {w for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split() if len(w) > 3}


# One market per proposal and one proposal per market: a plain best-overlap match sent two proposals to the same
# market (Grants Hub and ZAP1 both landed on Frontier Compute), which silently dropped two markets from every score.
pairs = []
for pid, t in truth.items():
    pw = words(t["title"])
    for m in markets:
        pairs.append((len(pw & words(m["marketName"])), pid, m["id"].lower()))
pairs.sort(reverse=True)
ref_for_proposal, used = {}, set()
for sc, pid, ref in pairs:
    if pid in ref_for_proposal or ref in used or sc == 0:
        continue
    ref_for_proposal[pid] = ref
    used.add(ref)
missing = [truth[p]["title"] for p in truth if p not in ref_for_proposal]
if missing:
    print("UNMATCHED proposals:", missing)
proposal_for_ref = {v: k for k, v in ref_for_proposal.items()}

# ---------------------------------------------------------------- estimates per bot
est = {b: {} for b in BOTS}
source = {}


def own_vector_file(bot, pattern, key="markets"):
    for d in reversed(chain10_passes(bot)):
        f = os.path.join(d, pattern)
        if not os.path.exists(f):
            continue
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        rows = data.get(key, data if isinstance(data, list) else [])
        got = {}
        for m in rows:
            ref = str(m.get("ref") or m.get("market") or "").lower()
            own = m.get("own")
            if ref in by_ref and isinstance(own, list) and len(own) >= 2:
                got[ref] = renorm(float(own[0]), float(own[1]))
        if len(got) >= 30:
            return got, os.path.basename(d), pattern
    return {}, None, pattern


est["fable-5.1"], asof_f, src_f = own_vector_file("fable-5.1", "fleet-grants.json")
est["gpt-5.6-sol"], asof_s, src_s = own_vector_file("gpt-5.6-sol", "fleet.json")
est["astra-gpt-6b"], asof_a, src_a = own_vector_file("astra-gpt-6b", "estimates.json")
source["fable-5.1"] = (src_f, asof_f)
source["gpt-5.6-sol"] = (src_s, asof_s)
source["astra-gpt-6b"] = (src_a, asof_a)

# astra writes its own vector under a different key when it writes estimates.json for chain 10
if len(est["astra-gpt-6b"]) < 30:
    for d in reversed(chain10_passes("astra-gpt-6b")):
        f = os.path.join(d, "estimates.json")
        if not os.path.exists(f):
            continue
        data = json.load(open(f, encoding="utf-8"))
        got = {}
        for m in data.get("markets", []):
            ref = str(m.get("ref", "")).lower()
            dist = m.get("own") or m.get("probabilities") or m.get("estimate")
            if ref in by_ref and isinstance(dist, list) and len(dist) >= 2:
                got[ref] = renorm(float(dist[0]), float(dist[1]))
            elif ref in by_ref and isinstance(m.get("pYes"), (int, float)):
                got[ref] = float(m["pYes"])
        if len(got) >= 30:
            est["astra-gpt-6b"] = got
            source["astra-gpt-6b"] = ("estimates.json", os.path.basename(d))
            break

# jev and the market: parse its report blocks
jev_est, mkt_est, jev_asof = {}, {}, None
for d in reversed(chain10_passes("jev")):
    f = os.path.join(d, "report.md")
    if not os.path.exists(f):
        continue
    text = open(f, encoding="utf-8", errors="ignore").read()
    blocks = re.split(r"\n(?=## )", text)
    got, mkt = {}, {}
    for b in blocks:
        ref = None
        u = re.search(r"markets/10/(0x[0-9a-fA-F]{40})", b)
        if u:
            ref = u.group(1).lower()
        if not ref:
            continue
        e = re.search(r"ESTIMATE\s+Yes ([\d.]+)%, No ([\d.]+)%", b)
        if e:
            got[ref] = renorm(float(e.group(1)), float(e.group(2)))
        p = re.search(r"MARKET\s+Yes ([\d.]+)%, No ([\d.]+)%", b)
        if p:
            mkt[ref] = renorm(float(p.group(1)), float(p.group(2)))
    if len(got) >= 30:
        jev_est, mkt_est, jev_asof = got, mkt, os.path.basename(d)
        break
est["jev"] = jev_est
source["jev"] = ("report.md", jev_asof)

# opus: its own estimate at the moment it traded, from the queue notes
opus = {}
rows = [json.loads(l) for l in open(os.path.join(PASSES, "opus-5", ".queue", "executed.jsonl"), encoding="utf-8")]
for r in rows:
    if int(r.get("chain", 10)) != 10 or r.get("status") != "done" or (r.get("kind") or "trade") != "trade":
        continue
    if r["executedAt"] >= "2026-09-29T20:00":
        continue
    ref = str(r.get("market", "")).lower()
    note = r.get("note") or ""
    m = re.search(r"own (?:Yes )?([01]\.\d+)", note) or re.search(r"own ([\d.]+)%", note)
    if ref in by_ref and m:
        v = float(m.group(1))
        opus[ref] = v / 100 if v > 1 else v
est["opus-5"] = opus
source["opus-5"] = ("queue notes (trade-time)", "16-29 Sep")

# ---------------------------------------------------------------- scoring
def score(name, forecasts):
    rows = []
    for ref, p in forecasts.items():
        pid = proposal_for_ref.get(ref)
        if pid is None:
            continue
        o = truth[pid]["outcome"]
        p = min(max(p, 0.0), 1.0)
        pc = min(max(p, 0.001), 0.999)
        rows.append(dict(ref=ref, proposal=truth[pid]["title"], p=p, outcome=o,
                         brier=(p - o) ** 2, logloss=-math.log(pc if o == 1 else 1 - pc),
                         hit=1 if (p >= 0.5) == (o == 1) else 0))
    if not rows:
        return None
    return dict(name=name, n=len(rows),
                brier=statistics.mean(r["brier"] for r in rows),
                logloss=statistics.mean(r["logloss"] for r in rows),
                accuracy=statistics.mean(r["hit"] for r in rows),
                meanForecast=statistics.mean(r["p"] for r in rows),
                baseRate=statistics.mean(r["outcome"] for r in rows),
                rows=rows)


forecasters = []
for b in BOTS:
    s = score(b, est[b])
    if s:
        s["source"], s["asOf"] = source[b]
        forecasters.append(s)
m = score("market (closing pool price)", mkt_est)
if m:
    m["source"], m["asOf"] = ("jev report MARKET lines", jev_asof)
    forecasters.append(m)
always = score("always 50/50", {ref: 0.5 for ref in proposal_for_ref})
always["source"], always["asOf"] = ("benchmark", "-")
forecasters.append(always)

json.dump(dict(truth=truth, refForProposal=ref_for_proposal, forecasters=forecasters), open(OUT, "w"), indent=1)

print("%-30s %5s %7s %8s %8s %8s %8s   %s" % ("forecaster", "n", "Brier", "logloss", "accuracy", "mean p", "base", "source"))
for f in sorted(forecasters, key=lambda x: x["brier"]):
    print("%-30s %5d %7.4f %8.4f %8.2f %8.3f %8.3f   %s @ %s" % (f["name"], f["n"], f["brier"], f["logloss"], f["accuracy"], f["meanForecast"], f["baseRate"], f["source"], f["asOf"]))
print("\naccepted %d of %d by ZEC weight" % (sum(t["outcome"] for t in truth.values()), len(truth)))
