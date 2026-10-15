import json, os, re, glob, csv, sys
ROOT = r"C:\Users\12\Desktop\bots"
BOTS = ["fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"]
MARKETS = [  # key, classifier, key-outcome label regex, positional index, seed
    ("smoothing",  r"Smooth",    r"Preserve|Halving", 1),
    ("features",   r"Ship",      r"Ship",             0),
    ("v4",         r"Immediate", r"Immediate",        0),
    ("reissuance", r"2031",      r"2031",             2),
    ("zip218",     r"\bYes\b",   r"Yes|^Y$",          0),
]
NUM = r"[01]?\.\d+|1\.0+"
def classify(line):
    for key, kw, *_ in MARKETS:
        if re.search(kw, line): return key
    return None
def group_format(line, label):
    # "Smooth/Preserve/Exclude/Invalid **.10/.70/.15/.05**"  or  "Y/N/I: 0.92/0.05/0.03"
    m = re.search(r"([A-Za-z0-9][A-Za-z0-9 \-]*(?:/[A-Za-z0-9][A-Za-z0-9 \-]*)+)\s*:?\s*\**\s*((?:%s)(?:\s*/\s*(?:%s))+)" % (NUM, NUM), line)
    if not m: return None
    labels = [x.strip() for x in m.group(1).split("/")]
    values = [float(x) for x in re.findall(NUM, m.group(2))]
    for i, l in enumerate(labels):
        if re.search(label, l, re.I) and i < len(values): return values[i]
    return None
def labeled(line, label):
    m = re.search(r"(?:%s)[a-z]*(?:\s+[A-Za-z\-]+)?[\s:*]{0,6}(%s)(?![\d])" % (label, NUM), line, re.I)
    return float(m.group(1)) if m else None
def positional(line, idx):
    body = re.split(r"(?i)traded|\(seed|;|\*\*\d|liquidity|w\s*=", line)[0]
    body = re.sub(r"(?i)market price", "", body)
    nums = re.findall(r"(?<![\d.])(%s)(?![\d])" % NUM, body)
    return float(nums[idx]) if len(nums) > idx else None
def price_of(t, spec):
    v = group_format(t, spec[2])
    if v is None and re.search(spec[2], t, re.I): v = labeled(t, spec[2])
    if v is None: v = positional(t, spec[3])
    return v
rows, unparsed, noprice = [], [], []
for bot in BOTS:
    for d in sorted(glob.glob(os.path.join(ROOT, bot, ".passes", "2026-*"))):
        rp = os.path.join(d, "report.md")
        if not os.path.isfile(rp): continue
        b = os.path.basename(d)
        ts_iso = b[:10] + "T" + b[11:13] + ":" + b[14:16] + "Z"
        res = {}
        try: res = json.load(open(os.path.join(d, "result.json")))
        except Exception: pass
        lines = open(rp, encoding="utf-8", errors="replace").read().replace("\r", "").split("\n")
        seen = {}
        for i, ln in enumerate(lines):
            s = ln.strip().lstrip("*").strip()
            if not re.match(r"ESTIMATE\b", s, re.I): continue
            key = classify(s)
            if not key or key in seen:
                if not key: unparsed.append((bot, ts_iso, s[:110]))
                continue
            spec = next(m for m in MARKETS if m[0] == key)
            est = group_format(s, spec[2])
            if est is None: est = labeled(s, spec[2])
            if est is None: unparsed.append((bot, ts_iso, s[:110])); continue
            price = swaps = vol = None; pline = None
            for j in range(i + 1, min(i + 10, len(lines))):
                t = lines[j].strip().lstrip("*").strip()
                if re.match(r"MARKET PRICE", t, re.I):
                    pline = t
                    price = price_of(t, spec)
                    m = re.search(r"(\d+) swaps? / ([\d,]+\.?\d*)", t) or re.search(r"traded (\d+) / ([\d,]+\.?\d*)", t) or re.search(r"\*\*(\d+) / ([\d,]+\.?\d*) / \d+\*\*", t)
                    if m: swaps, vol = int(m.group(1)), float(m.group(2).replace(",", ""))
                    break
            if price is None: noprice.append((bot, ts_iso, key, (pline or "<no MARKET PRICE line>")[:150]))
            seen[key] = True
            rows.append(dict(time=ts_iso, model=bot, market=key, estimate=est, price=price, swaps=swaps, volume=vol,
                             cash=None if res.get("cash") is None else round(res["cash"], 2), status=res.get("status")))
rows.sort(key=lambda r: (r["time"], r["model"], r["market"]))
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "estimates.csv")
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print("rows:", len(rows), "->", out)
for r in rows: print("%s %-11s %-10s est %.2f  price %-6s swaps %-4s vol %-8s cash %s" % (r["time"], r["model"], r["market"], r["estimate"], r["price"], r["swaps"], r["volume"], r["cash"]))
print("\nUNPARSED ESTIMATE lines:", len(unparsed))
for u in unparsed: print("  ", u)
print("\nNO PRICE parsed:", len(noprice))
for u in noprice: print("  ", u)
