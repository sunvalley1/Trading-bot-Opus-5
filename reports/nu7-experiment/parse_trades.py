import json, os, re, csv, glob
ROOT = r"C:\Users\12\Desktop\bots"
BOTS = ["fable-5.1", "opus-5", "astra-gpt-6", "gpt-5.6-sol"]
NAMES = {"0xc38fa340cfdc9c758826dd4a8dc15b58728d0418": "Q4 ZIP-218", "0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc": "Q1 NSM smoothing",
         "0xc03bf1725b72ab5765b639c582853ede9afb26a6": "Q5 Sept-30 features", "0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6": "Q3 v4 disable",
         "0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c": "Q2 NSM reissuance"}
rows = []
for bot in BOTS:
    for line in open(os.path.join(ROOT, bot, ".queue", "executed.jsonl"), encoding="utf-8"):
        line = line.strip()
        if not line: continue
        r = json.loads(line)
        rec = dict(model=bot, queuedAt=r["createdAt"], executedAt=r.get("executedAt"), kind=r.get("kind", "trade"), market=NAMES.get(r["market"], r["market"]),
                   outcome=r.get("outcome"), route=r.get("route"), size=r.get("size"), allowAdd=r.get("allowAdd"), status=r.get("status"), reason=(r.get("reason") or "")[:160],
                   note=(r.get("note") or "")[:200], target="", fill="", spot="", slippage="", cost="", cashAfter="", txs="", position="")
        lp = r.get("log")
        if lp and os.path.isfile(lp):
            txt = open(lp, encoding="utf-8", errors="replace").read().replace("\r", "")
            m = re.search(r"target outcome \[\d+\] (.+)", txt);           rec["target"] = m.group(1).strip() if m else ""
            m = re.search(r"average fill ([\d.]+) vs (?:spot )?([\d.]+)[^\n]*?\(([\d.]+)% slippage\)", txt)
            if m: rec["fill"], rec["spot"], rec["slippage"] = m.group(1), m.group(2), m.group(3)
            m = re.search(r"sUSDS\s+([\d.]+)\s+\(was ([\d.]+)\)", txt)
            if m: rec["cashAfter"] = m.group(1); rec["cost"] = "%.4f" % (float(m.group(2)) - float(m.group(1)))
            rec["txs"] = " ".join(re.findall(r"^\s*tx .*?(0x[0-9a-f]{64})", txt, re.M))
            m = re.search(r"POSITION after the trade:\n((?:  .+\n)+)", txt)
            if m: rec["position"] = " | ".join(re.sub(r"\s+", " ", x.strip()) for x in m.group(1).strip().split("\n") if "sUSDS" not in x)
            if not rec["target"]:
                m = re.search(r"ROUTE\s+\w+\s+(?:target outcome|short|sell|fade)[^\n]*?\[\d+\] (.+)", txt)
                if m: rec["target"] = m.group(1).strip()
        rows.append(rec)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trades.csv")
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print("records:", len(rows), "->", out)
for r in rows:
    if r["status"] in ("done",) or r["kind"] == "unwind":
        print("%s %-11s %-6s %-20s out %-2s %-6s size %-8s fill %-6s spot %-6s slip %-5s cost %-9s %s\n      target: %s\n      position: %s\n      txs: %s" % (
            r["executedAt"], r["model"], r["kind"], r["market"], r["outcome"], r["route"], r["size"], r["fill"], r["spot"], r["slippage"], r["cost"], r["status"], r["target"], r["position"][:160], r["txs"][-66:]))
print("\nfailed/stale:")
for r in rows:
    if r["status"] not in ("done",) and r["kind"] != "unwind":
        print("  %s %-11s %-20s out %s %-6s size %-8s %s: %s" % (r["queuedAt"], r["model"], r["market"], r["outcome"], r["route"], r["size"], r["status"], r["reason"][:90]))
