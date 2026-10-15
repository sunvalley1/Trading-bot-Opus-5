import csv, json, os, re, glob, datetime, statistics
S = os.path.dirname(os.path.abspath(__file__))
ROOT = r"C:\Users\12\Desktop\bots"
MODELS = [
    dict(key="fable-5.1",   name="Claude Fable 5.1", vendor="Anthropic", wallet="0xf1b285F65A3174c9D6E062F089c5CD1Ea8cF30D9", slot="xx:35 UTC, even hours"),
    dict(key="opus-5",      name="Claude Opus 5",    vendor="Anthropic", wallet="0x6e8211F9059648ee6b88fDCB3dB0415d9015cc9e", slot="xx:55 UTC, even hours"),
    dict(key="astra-gpt-6", name="GPT-6 Astra",      vendor="OpenAI",    wallet="0x017859431458cEdac674344f6031d41c9A68a858", slot="xx:15 UTC, odd hours"),
    dict(key="gpt-5.6-sol", name="GPT-5.6 Sol",      vendor="OpenAI",    wallet="0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe", slot="xx:35 UTC, odd hours"),
]
MARKETS = [
    dict(key="zip218",     q="Q4", short="ZIP-218 faster blocks",    title="Will the poll approve ZIP-218 (block spacing 75s to 25s, per-pool action limits)?", address="0xc38fa340cfdc9c758826dd4a8dc15b58728d0418", keyOutcome="Yes", ballotQ=4, ballotKw="Yes"),
    dict(key="smoothing",  q="Q1", short="NSM issuance smoothing",   title="Which NSM issuance smoothing approach will be selected?", address="0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc", keyOutcome="Preserve halvings", ballotQ=1, ballotKw="Preserve"),
    dict(key="features",   q="Q5", short="Sept-30 feature deadline", title="How will features not ready by the September 30th deadline be handled?", address="0xc03bf1725b72ab5765b639c582853ede9afb26a6", keyOutcome="Ship NU7 as soon as possible", ballotQ=5, ballotKw="Ship"),
    dict(key="v4",         q="Q3", short="Disable v4 transactions",  title="When will v4 transactions be disabled?", address="0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6", keyOutcome="Immediately at NU7 activation", ballotQ=3, ballotKw="Immediately"),
    dict(key="reissuance", q="Q2", short="NSM reissuance start",     title="When will NSM reissuance of funds removed from circulation begin?", address="0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c", keyOutcome="February 2031", ballotQ=2, ballotKw="2031"),
]
# --- ballots (live vote-chain summary)
vs = json.load(open(S + "/vote-summary.json", encoding="utf-8"))
for m in MARKETS:
    p = next(p for p in vs["proposals"] if p["id"] == m["ballotQ"])
    opts = [o for o in p["options"] if not o["label"].lower().startswith("abstain")]
    ex = sum(o["ballot_count"] for o in opts)
    m["ballots"] = [dict(label=o["label"].rstrip("."), count=o["ballot_count"], share=o["ballot_count"] / ex) for o in opts]
    m["abstain"] = next(o["ballot_count"] for o in p["options"] if o["label"].lower().startswith("abstain"))
    m["ballotShare"] = next(b["share"] for b in m["ballots"] if m["ballotKw"].lower() in b["label"].lower())
    m["ballotsTotal"] = ex + m["abstain"]
# --- market state now (seed -> now, swaps, volume, traders)
for m in MARKETS:
    txt = open(S + "/market/" + m["address"] + ".txt", encoding="utf-8", errors="replace").read().replace("\r", "")
    t = re.search(r"TRADED\s+(\d+) swaps\s+([\d.]+) sUSDS volume\s+(\d+) traders\s+last trade ([\d.]+) h ago", txt)
    m["swaps"], m["volume"], m["traders"], m["lastTradeH"] = int(t.group(1)), float(t.group(2)), int(t.group(3)), float(t.group(4))
    m["drained"] = "NOT TRADEABLE" in txt
    rows = re.findall(r"^  (.{2,42}?)\s{2,}([\d.]+) -> ([\d.]+)\s+(-?[\d.]+) pts\s+(\d+)\s+(\d+)/(\d+)\s+([\d.]+)$", txt, re.M)
    m["outcomes"] = [dict(label=r[0].strip(), seed=float(r[1]), now=float(r[2]), swaps=int(r[4]), buys=int(r[5]), sells=int(r[6]), volume=float(r[7])) for r in rows]
    ko = next(o for o in m["outcomes"] if m["ballotKw"].lower() in o["label"].lower())
    m["seed"], m["priceNow"] = ko["seed"], ko["now"]
# --- estimates
est = list(csv.DictReader(open(S + "/estimates.csv")))
for r in est:
    r["estimate"] = float(r["estimate"])
    r["price"] = float(r["price"]) if r["price"] else None
    r["cash"] = float(r["cash"]) if r["cash"] else None
NOW = "2026-09-14T14:45Z"
prices = {}
for r in est:
    # Opus quoted its own blended Yes (0.92-0.93) on the ZIP-218 price line; every other read of that pool was 0.88
    if r["price"] is not None and not (r["model"] == "opus-5" and r["market"] == "zip218" and r["price"] > 0.9):
        prices.setdefault(r["market"], {})[r["time"]] = r["price"]
for m in MARKETS:
    prices.setdefault(m["key"], {})[NOW] = m["priceNow"]
price_series = {}
for k, v in prices.items():
    pts = sorted(v.items())
    keep = []
    for i, (t, p) in enumerate(pts):
        prev_p = pts[i - 1][1] if i > 0 else None
        next_p = pts[i + 1][1] if i < len(pts) - 1 else None
        # a single read that disagrees with both neighbours while they agree with each other is a misread in that pass report
        if prev_p is not None and next_p is not None and abs(p - prev_p) > 0.08 and abs(p - next_p) > 0.08 and abs(prev_p - next_p) < 0.03:
            print("dropping price outlier", k, t, p, "between", prev_p, next_p)
            continue
        keep.append((t, p))
    price_series[k] = keep
# --- passes and cash
for mo in MODELS:
    st = dict(finished=0, failed=0, killed=0)
    first = last = None
    for d in sorted(glob.glob(os.path.join(ROOT, mo["key"], ".passes", "2026-*"))):
        try:
            r = json.load(open(os.path.join(d, "result.json")))
        except Exception:
            continue
        b = os.path.basename(d)
        t = b[:10] + "T" + b[11:13] + ":" + b[14:16] + "Z"
        if r.get("status") == "finished":
            st["finished"] += 1
            last = t
            first = first or t
        elif r.get("status") == "failed":
            st["failed"] += 1
        elif r.get("status") == "running":
            st["killed"] += 1
    mo["passes"] = st
    mo["firstPass"], mo["lastPass"] = first, last
    cashes = [r["cash"] for r in est if r["model"] == mo["key"] and r["cash"] and r["status"] == "finished"]
    mo["startCash"], mo["cash"] = cashes[0], cashes[-1]
    mo["spent"] = round(mo["startCash"] - mo["cash"], 4)
# --- trades
tr = list(csv.DictReader(open(S + "/trades.csv", encoding="utf-8")))
name2key = {"Q4 ZIP-218": "zip218", "Q1 NSM smoothing": "smoothing", "Q5 Sept-30 features": "features", "Q3 v4 disable": "v4", "Q2 NSM reissuance": "reissuance"}
done, failed = [], []
for r in tr:
    if r["kind"] == "unwind" or r["market"] not in name2key:
        continue
    k = name2key[r["market"]]
    if r["status"] == "done":
        route = r["route"]
        tgt = r["target"] or "?"
        if route == "fade":
            action = "Short " + tgt
        elif route == "split":
            action = "Buy " + tgt + " (split)"
        else:
            action = "Buy " + tgt
        cost = float(r["cost"]) if r["cost"] else float(r["size"])
        done.append(dict(t=r["executedAt"][:16] + "Z", model=r["model"], market=k, action=action, target=tgt, route=route, size=float(r["size"]),
                         fill=float(r["fill"]) if r["fill"] else None, spot=float(r["spot"]) if r["spot"] else None,
                         slip=float(r["slippage"]) if r["slippage"] else None, cost=round(cost, 2),
                         tx=r["txs"].split()[-1] if r["txs"] else "", position=r["position"]))
    elif r["status"] == "failed":
        failed.append(dict(t=r["queuedAt"][:16] + "Z", model=r["model"], market=k, route=r["route"], size=r["size"], reason=r["reason"]))
done.sort(key=lambda x: x["t"])
for mo in MODELS:
    mo["tradesDone"] = sum(1 for d in done if d["model"] == mo["key"])
    mo["tradesFailed"] = sum(1 for d in failed if d["model"] == mo["key"])
# --- positions: the onchain POSITION read after each trade (latest per market); Opus Q3 from the operator's onchain correction
positions = {mo["key"]: {} for mo in MODELS}
for d in done:
    if not d["position"]:
        continue
    pos = {}
    for part in d["position"].split(" | "):
        m2 = re.search(r"^(.*?)\s*([\d]+\.\d{4}) (\S+)$", part.strip())
        if m2:
            pos[m2.group(3)] = dict(label=m2.group(1).strip(), tokens=float(m2.group(2)))
    positions[d["model"]][d["market"]] = pos
positions["opus-5"]["v4"] = {"ZNU7V3Q3IMMEDIATE": dict(label="Immediately at NU7 activation", tokens=161.5258)}
WIN = {"zip218": "YES", "smoothing": "PRESERVE", "features": "SHIP", "v4": "IMMEDIATE", "reissuance": "FEB2031"}
for mo in MODELS:
    pay = 0.0
    hold = []
    for k, pos in positions[mo["key"]].items():
        for tick, p in pos.items():
            hold.append(dict(market=k, outcome=p["label"], ticker=tick, tokens=p["tokens"]))
            if tick.endswith(WIN[k]):
                pay += p["tokens"]
    mo["holdings"] = hold
    mo["payoffIfLeaders"] = round(pay, 2)
    mo["pnlIfLeaders"] = round(pay - mo["spent"], 2)
# --- convergence metrics per market per 2h window
def parse_t(t):
    return datetime.datetime.strptime(t, "%Y-%m-%dT%H:%MZ")
t0 = parse_t("2026-09-13T14:00Z")
ends = [t0 + datetime.timedelta(hours=2 * i) for i in range(1, 14)]
metrics = {}
for m in MARKETS:
    k = m["key"]
    out = []
    for e in ends:
        vals = {}
        for mo in MODELS:
            rs = [r for r in est if r["model"] == mo["key"] and r["market"] == k and e - datetime.timedelta(hours=4.5) < parse_t(r["time"]) <= e]
            if rs:
                vals[mo["key"]] = rs[-1]["estimate"]
        ps = [p for t, p in price_series[k] if parse_t(t) <= e]
        price = ps[-1] if ps else None
        if len(vals) >= 3:
            v = list(vals.values())
            out.append(dict(t=e.strftime("%Y-%m-%dT%H:%MZ"), n=len(v), mean=round(statistics.mean(v), 4), sd=round(statistics.pstdev(v), 4),
                            spread=round(max(v) - min(v), 4), price=price,
                            gap=None if price is None else round(statistics.mean(abs(x - price) for x in v), 4), vals=vals))
    metrics[k] = out
data = dict(generatedAt=datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), pollCloses="2026-09-14T19:00Z", now=NOW, models=MODELS, markets=MARKETS,
            estimates=[dict(t=r["time"], model=r["model"], market=r["market"], est=r["estimate"], price=r["price"]) for r in est],
            prices=price_series, trades=done, failed=failed, metrics=metrics)
json.dump(data, open(S + "/report-data.json", "w"), indent=1)
print("models:")
for m in MODELS:
    print("  %-12s start %.2f now %.2f spent %.2f  passes %s  trades %d done/%d failed  payoffIfLeaders %.2f pnl %+.2f" % (
        m["key"], m["startCash"], m["cash"], m["spent"], m["passes"], m["tradesDone"], m["tradesFailed"], m["payoffIfLeaders"], m["pnlIfLeaders"]))
print("markets:")
for m in MARKETS:
    print("  %-10s seed %.4f now %.4f ballots %.1f%%  swaps %d vol %.2f traders %d drained %s  last %.1fh" % (
        m["key"], m["seed"], m["priceNow"], 100 * m["ballotShare"], m["swaps"], m["volume"], m["traders"], m["drained"], m["lastTradeH"]))
print("holdings:")
for m in MODELS:
    print("  ", m["key"], [(h["market"], h["ticker"], h["tokens"]) for h in m["holdings"]])
print("metrics (sd across models, mean gap to price) first -> last window per market:")
for k, out in metrics.items():
    if out:
        print("  %-10s %s n=%d sd %.3f gap %s  ->  %s n=%d sd %.3f gap %s" % (k, out[0]["t"], out[0]["n"], out[0]["sd"], out[0]["gap"], out[-1]["t"], out[-1]["n"], out[-1]["sd"], out[-1]["gap"]))
print("trades:", len(done), "failed:", len(failed))
