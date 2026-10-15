"""
Builds reports/NU7-four-model-experiment.pptx from:
  report-data.json   models, markets, trades, failed sends (assemble.py)
  scores.json        official result, P&L, forecast scores, parsed estimates, onchain price history (score.py)
  onchain.json       raw pool events, gas receipts (onchain.ts)

    python reports/nu7-experiment/build_deck.py
"""
import datetime
import json
import math
import os
import statistics

from pptx import Presentation
from pptx.chart.data import XyChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_MARKER_STYLE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "report-data.json"), encoding="utf-8"))
S = json.load(open(os.path.join(HERE, "scores.json"), encoding="utf-8"))
OC = json.load(open(os.path.join(HERE, "onchain.json"), encoding="utf-8"))
OUT = os.path.join(os.path.dirname(HERE), "NU7-four-model-experiment.pptx")

# ---------- palette & type ----------
INK, PAPER, MUTED, RULE, FAINT = RGBColor(0x17, 0x1C, 0x26), RGBColor(0xF7, 0xF8, 0xFA), RGBColor(0x5C, 0x66, 0x75), RGBColor(0xD6, 0xDB, 0xE3), RGBColor(0xEE, 0xF0, 0xF3)
NAVY, GOLD, WHITE = RGBColor(0x14, 0x1A, 0x2B), RGBColor(0xD9, 0xA2, 0x1B), RGBColor(0xFF, 0xFF, 0xFF)
GOOD, GOOD_BG, BAD, BAD_BG = RGBColor(0x1E, 0x7A, 0x46), RGBColor(0xDF, 0xF1, 0xE6), RGBColor(0xB8, 0x3A, 0x2E), RGBColor(0xF6, 0xE1, 0xDE)
SOFT = RGBColor(0x8A, 0x94, 0xA3)
MODEL_RGB = {"fable-5.1": RGBColor(0xC4, 0x55, 0x2A), "opus-5": RGBColor(0x7A, 0x2E, 0x8C), "astra-gpt-6": RGBColor(0x1B, 0x7F, 0x63), "gpt-5.6-sol": RGBColor(0x2F, 0x6F, 0xD6)}
HEAD, BODY, MONO = "Bahnschrift", "Segoe UI", "Consolas"
MODELS = D["models"]
MARKETS = sorted(D["markets"], key=lambda x: x["q"])
MKEYS = [m["key"] for m in MODELS]
MNAME = {m["key"]: m["name"] for m in MODELS}
MK = {m["key"]: m for m in MARKETS}
RES = S["results"]
PNL = S["pnl"]
SHORT_WIN = {"zip218": "Yes", "smoothing": "Preserve halvings", "features": "Ship NU7 asap", "v4": "Immediately", "reissuance": "February 2031"}
SHORT_OUTCOME = {
    "Smooth issuance curve": "Smooth", "Preserve halvings": "Preserve", "Do not include issuance smoothing in NU7": "Do not include",
    "As soon as possible": "As soon as possible", "February 2027 regardless of the outcome of Q1": "Feb-2027", "February 2031 regardless of the outcome of Q1": "Feb-2031",
    "Immediately at NU7 activation": "Immediately", "One year after this poll concludes": "One year", "Do not set a date to disable v4 transactions": "No date",
    "Yes": "Yes", "No": "No", "Invalid result": "Invalid",
    "Ship NU7 as soon as possible, removing any feature not implemented by the September 30th deadline": "Ship",
    "Delay NU7 until every applicable approved feature is deemed complete": "Delay", "I do not support this NU7 plan": "Do not support",
}
AS_OF = S["onchainCollectedAt"]

EPOCH = datetime.datetime(1899, 12, 31)  # PowerPoint renders chart serial dates one day later than Excel's 1900 system


def to_dt(t):
    t = t.rstrip("Z")
    fmt = "%Y-%m-%dT%H:%M:%S" if len(t) > 16 else "%Y-%m-%dT%H:%M"
    return datetime.datetime.strptime(t, fmt)


def xs(t):
    return (to_dt(t) - EPOCH).total_seconds() / 86400.0


def fmt_t(t):
    d = to_dt(t)
    return "%d Sep %s" % (d.day, d.strftime("%H:%M"))


XMIN, XMAX = xs("2026-09-13T12:00Z"), xs("2026-09-15T00:00Z")

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
slide_no = [0]


# ---------- helpers ----------
def bg(slide, color):
    f = slide.background.fill
    f.solid()
    f.fore_color.rgb = color


def rect(slide, x, y, w, h, fill, line=None, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(0.75)
    s.shadow.inherit = False
    return s


def set_bullet(para, char="•", indent=0.22):
    pPr = para._p.get_or_add_pPr()
    pPr.set("marL", str(int(Inches(indent))))
    pPr.set("indent", str(-int(Inches(indent))))
    for tag in ("a:buNone", "a:buChar", "a:buAutoNum"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    pPr.append(pPr.makeelement(qn("a:buChar"), {"char": char}))


def text(slide, x, y, w, h, paras, size=13, color=INK, font=BODY, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=None):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    if isinstance(paras, str):
        paras = [paras]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        o = p if isinstance(p, dict) else {"text": p}
        para.alignment = o.get("align", align)
        if spacing or o.get("spacing"):
            para.line_spacing = o.get("spacing", spacing)
        para.space_after = Pt(o.get("after", 0))
        para.space_before = Pt(o.get("before", 0))
        runs = o.get("runs") or [(o.get("text", ""), {})]
        for rt, ro in runs:
            r = para.add_run()
            r.text = rt
            f = r.font
            f.size = Pt(ro.get("size", o.get("size", size)))
            f.name = ro.get("font", o.get("font", font))
            f.bold = ro.get("bold", o.get("bold", bold))
            f.italic = ro.get("italic", o.get("italic", False))
            f.color.rgb = ro.get("color", o.get("color", color))
        if o.get("bullet"):
            set_bullet(para, o.get("char", "•"))
    return tb


def cell_set(c, content, size=10, bold=False, color=INK, fill=WHITE, font=BODY, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.MIDDLE):
    """content: a string, a list of strings, or a list of dicts {text,size,bold,color,font} (one paragraph each)."""
    c.fill.solid()
    c.fill.fore_color.rgb = fill
    c.margin_left = c.margin_right = Inches(0.06)
    c.margin_top = c.margin_bottom = Inches(0.025)
    c.vertical_anchor = anchor
    tf = c.text_frame
    tf.word_wrap = True
    lines = content if isinstance(content, list) else [content]
    for i, ln in enumerate(lines):
        o = ln if isinstance(ln, dict) else {"text": str(ln)}
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = o.get("align", align)
        r = p.add_run()
        r.text = o["text"]
        r.font.size = Pt(o.get("size", size))
        r.font.bold = o.get("bold", bold)
        r.font.name = o.get("font", font)
        r.font.color.rgb = o.get("color", color)


def table(slide, x, y, col_w, header, rows, size=10, hsize=9.5, row_h=0.3, hrow_h=None, aligns=None, mono=(), fills=None, colors=None, bolds=None, row_heights=None):
    n, m = len(rows) + 1, len(header)
    shp = slide.shapes.add_table(n, m, Inches(x), Inches(y), Inches(sum(col_w)), Inches(row_h * n))
    tbl = shp.table
    tbl.first_row = True
    tbl.horz_banding = False
    for j, cw in enumerate(col_w):
        tbl.columns[j].width = Inches(cw)
    tbl.rows[0].height = Inches(hrow_h or row_h)
    for i in range(1, n):
        tbl.rows[i].height = Inches(row_heights[i - 1] if row_heights else row_h)
    for j, h in enumerate(header):
        cell_set(tbl.cell(0, j), h, size=hsize, bold=True, color=WHITE, fill=NAVY, align=(aligns[j] if aligns else PP_ALIGN.LEFT))
    for i, row in enumerate(rows, 1):
        for j, v in enumerate(row):
            fill = FAINT if i % 2 == 0 else WHITE
            if fills and fills.get((i - 1, j)) is not None:
                fill = fills[(i - 1, j)]
            col = colors.get((i - 1, j), INK) if colors else INK
            bold = bolds.get((i - 1, j), False) if bolds else False
            cell_set(tbl.cell(i, j), v, size=size, fill=fill, color=col, bold=bold, font=(MONO if j in mono else BODY), align=(aligns[j] if aligns else PP_ALIGN.LEFT))
    return tbl


def footer(slide):
    slide_no[0] += 1
    text(slide, 0.5, 7.05, 10, 0.3, "NU7 four-model experiment · Seer on Optimism · onchain data as of %s UTC" % fmt_t(AS_OF).replace(" Sep", " Sep 2026"), size=9, color=MUTED)
    text(slide, 12.0, 7.05, 0.85, 0.3, str(slide_no[0]), size=9, color=MUTED, align=PP_ALIGN.RIGHT)


def title(slide, t, sub=None):
    text(slide, 0.5, 0.35, 12.3, 0.7, t, size=26, font=HEAD, bold=True)
    rect(slide, 0.55, 1.03, 0.9, 0.045, GOLD)
    if sub:
        text(slide, 0.5, 1.15, 12.3, 0.5, sub, size=12.5, color=MUTED)


def content_slide(t, sub=None):
    s = prs.slides.add_slide(BLANK)
    bg(s, PAPER)
    title(s, t, sub)
    footer(s)
    return s


def section_slide(t, paras):
    s = prs.slides.add_slide(BLANK)
    bg(s, NAVY)
    slide_no[0] += 1
    text(s, 0.8, 2.3, 11.5, 1.2, t, size=40, font=HEAD, bold=True, color=WHITE)
    rect(s, 0.85, 3.45, 1.4, 0.06, GOLD)
    text(s, 0.8, 3.7, 11, 2.6, paras)
    return s


def xy_chart(slide, x, y, w, h, series, ymin=0, ymax=1, yunit=0.25, yfmt="0%", xunit=0.25, legend=True, xmin=XMIN, xmax=XMAX, xfmt="dd mmm hh:mm"):
    cd = XyChartData()
    for s in series:
        se = cd.add_series(s["name"])
        for px, py in s["points"]:
            se.add_data_point(px, py)
    gf = slide.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER_LINES, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    ch = gf.chart
    ch.font.size = Pt(9)
    ch.font.name = BODY
    ch.font.color.rgb = MUTED
    ch.has_legend = legend
    if legend:
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False
        ch.legend.font.size = Pt(9.5)
    xa = ch.category_axis
    xa.minimum_scale, xa.maximum_scale, xa.major_unit = xmin, xmax, xunit
    xa.tick_labels.number_format = xfmt
    xa.tick_labels.number_format_is_linked = False
    xa.has_major_gridlines = False
    xa.format.line.color.rgb = RULE
    xa.tick_labels.font.size = Pt(9)
    ya = ch.value_axis
    ya.minimum_scale, ya.maximum_scale, ya.major_unit = ymin, ymax, yunit
    ya.tick_labels.number_format = yfmt
    ya.tick_labels.number_format_is_linked = False
    ya.has_major_gridlines = True
    ya.major_gridlines.format.line.color.rgb = RULE
    ya.major_gridlines.format.line.width = Pt(0.5)
    ya.format.line.color.rgb = RULE
    ya.tick_labels.font.size = Pt(9)
    for s, ps in zip(series, ch.series):
        ps.smooth = False
        ln = ps.format.line
        ln.color.rgb = s["color"]
        ln.width = Pt(s.get("width", 2))
        if s.get("dash"):
            ln.dash_style = MSO_LINE_DASH_STYLE.DASH
        if s.get("dot"):
            ln.dash_style = MSO_LINE_DASH_STYLE.ROUND_DOT
        if s.get("marker", True):
            ps.marker.style = s.get("mstyle", XL_MARKER_STYLE.CIRCLE)
            ps.marker.size = s.get("msize", 5)
            ps.marker.format.fill.solid()
            ps.marker.format.fill.fore_color.rgb = s["color"]
            ps.marker.format.line.color.rgb = s["color"]
        else:
            ps.marker.style = XL_MARKER_STYLE.NONE
    return ch


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return RGBColor(*[int(round(a + (b - a) * t)) for a, b in zip(c1, c2)])


def sus(x, sign=False, d=2):
    return ("%+." + str(d) + "f") % x if sign else ("%." + str(d) + "f") % x


# ---------- derived numbers ----------
trades = D["trades"]
failed = D["failed"]
PASSES = S["agentPasses"]
reports_total = sum(len(PASSES[m]) for m in MKEYS)


def pass_of_trade(t):
    cands = [p for p in PASSES[t["model"]] if p["started"] <= t["t"][:16] + ":59Z"]
    return cands[-1]["started"] if cands else None


trade_passes = {(t["model"], pass_of_trade(t)) for t in trades}
last_trade_t = max(t["t"] for t in trades)
after = sum(1 for m in MKEYS for p in PASSES[m] if p["started"][:16] > last_trade_t[:16])
no_trade_reports = reports_total - len(trade_passes)


def winner(k):
    return RES[k]["winner"]


def estimate_series(m, k):
    w = winner(k)
    return [(p["started"], p["est"][k][w]) for p in PASSES[m] if k in p["est"]]


HIST = {key: [(e[0], e[1]) for e in v] for key, v in S["priceHistory"].items()}


def price_at(k, i, t):
    last = None
    for et, p in HIST["%s:%d" % (k, i)]:
        if et <= t:
            last = p
        else:
            break
    return last


def price_steps(k, i, t_from, t_to):
    prev = price_at(k, i, t_from)
    pts = [(xs(t_from), prev)]
    for et, p in HIST["%s:%d" % (k, i)]:
        if t_from < et <= t_to:
            pts += [(xs(et), prev), (xs(et), p)]
            prev = p
    pts.append((xs(t_to), prev))
    return pts


# dispersion windows: every 2 h, the latest estimate of each model made in the 4.5 h before the window end
def windows(k):
    out = []
    w = winner(k)
    t0 = datetime.datetime(2026, 9, 13, 16, 0)
    for i in range(1, 14):
        e = t0 + datetime.timedelta(hours=2 * i)
        e_iso = e.strftime("%Y-%m-%dT%H:%M:%SZ")
        lo = (e - datetime.timedelta(hours=4.5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        vals = {}
        for m in MKEYS:
            ps = [p for p in PASSES[m] if lo < p["started"] <= e_iso and k in p["est"]]
            if ps:
                vals[m] = ps[-1]["est"][k][w]
        if len(vals) == 4:
            price = price_at(k, w, e_iso)
            v = list(vals.values())
            out.append(dict(t=e_iso, sd=statistics.pstdev(v), gap=statistics.mean(abs(x - price) for x in v), price=price))
    return out


WIN = {mk["key"]: windows(mk["key"]) for mk in MARKETS}
FORE = {f["name"]: f for f in S["forecasters"]}
AGENT_F = [f for f in S["forecasters"] if f["kind"] == "agent"]
MEAN_F = FORE["Mean of the four agents"]
SEED_F = FORE["Opening price (pool seed)"]
PRE_F = FORE["Market before the bots traded"]
FINAL_F = FORE["Market final price"]
BALLOT_F = FORE["Live ballot share (reference)"]
arb_addr = max(((e["from"], sum(1 for x in OC["events"] if x["kind"] == "Swap" and x["from"] == e["from"])) for e in OC["events"] if e["kind"] == "Swap"), key=lambda x: x[1])
swaps_total = sum(1 for e in OC["events"] if e["kind"] == "Swap")
arb_txs = len({e["tx"] for e in OC["events"] if e["kind"] == "Swap" and e["from"] == arb_addr[0]})
seeder = next(e["from"] for e in OC["events"] if e["kind"] == "Initialize")
tot_cost = sum(PNL[m]["cost"] for m in MKEYS)
tot_pay = sum(PNL[m]["payoff"] for m in MKEYS)
tot_net = sum(PNL[m]["net"] for m in MKEYS)
tot_gas_usd = sum(PNL[m]["gasUsd"] for m in MKEYS)
tot_gas_txs = sum(PNL[m]["gasTxs"] for m in MKEYS)
agent_briers = sorted(f["brier"] for f in AGENT_F)
agent_ll = sorted(f["logloss"] for f in AGENT_F)
ser = S["series"]
mk_brier = [x["brier"] for x in ser["market"]]
i20 = ser["grid"].index("2026-09-13T20:00:00Z")
drop_share = (ser["pre"] - mk_brier[i20]) / (ser["pre"] - mk_brier[-1])


def final_raw(m, k):
    ps = [p for p in PASSES[m] if k in p["est"]]
    return ps[-1]["est"][k]


# ======================================================================
# 1. TITLE
s = prs.slides.add_slide(BLANK)
bg(s, NAVY)
text(s, 0.8, 1.45, 11, 0.4, "SEER PREDICTION MARKETS  ·  ZCASH NU7 COINHOLDER POLL  ·  OPTIMISM", size=11, color=GOLD, bold=True)
text(s, 0.8, 1.95, 11.5, 1.6, "Four models, five markets, one poll", size=46, font=HEAD, bold=True, color=WHITE)
rect(s, 0.85, 3.6, 1.4, 0.06, GOLD)
text(s, 0.8, 3.85, 11.2, 1.5, "What four AI trading agents did with about $1,000 each on the NU7 markets on 13 and 14 September 2026, whether their prices converged, and how they scored once the poll result was published.", size=17, color=RGBColor(0xC9, 0xCF, 0xD8))
text(s, 0.8, 5.55, 11.5, 0.45, [dict(runs=[("Result: ", dict(bold=True, color=GOLD)), ("every ballot leader won. All four agents picked all five winners and are up %s sUSDS together; the market's prices picked three." % sus(tot_net, True), dict(color=WHITE))])], size=13)
text(s, 0.8, 6.2, 11, 0.4, "Claude Fable 5.1  ·  Claude Opus 5  ·  GPT-6 Astra  ·  GPT-5.6 Sol", size=13, color=WHITE, bold=True)
text(s, 0.8, 6.6, 11.8, 0.4, "The poll closed 14 Sep 19:00 UTC. Onchain data as of %s UTC; no oracle answer has been posted yet, so nothing is redeemed." % fmt_t(AS_OF).replace(" Sep", " Sep 2026"), size=11, color=SOFT)
slide_no[0] += 1

# ======================================================================
# 2. THE EXPERIMENT
s = content_slide("The experiment", "One code base, one trading skill, four models, each with its own wallet and its own opinion.")
bul = [
    "The only thing that differs between the four bots is the model. Same code, same skill, same five markets, same public information.",
    "Each bot owns a wallet funded with 901 to 917 sUSDS (≈ $1,000 at 1.11 USD per sUSDS). Old positions were unwound first, so all four started as cash.",
    "Every 2 hours each bot runs a full pass: read the pools, re-read the live ballot counts, re-estimate every outcome, size with quarter-Kelly, queue trades. The bots run 20 minutes apart, so each one sees the others' trades as new prices and volume.",
    "Guard rails in the code: 5-point minimum edge measured against the real fill, 15% maximum slippage, 20% of bankroll per market, 50% per correlated event, and no adding to a position unless the pass says so.",
    "No model ever signs. A plain script executes the queue after the pass with that folder's key; anything queued outside the five markets is refused.",
    "Research inputs are public: live ballot splits from the Zcash vote chain (not ZEC-weighted), the ZEC-weighted Feb-2026 sentiment poll as a prior for large holders, and the pools' own swap history.",
]
text(s, 0.5, 1.75, 6.6, 5.1, [dict(text=b, bullet=True, after=7, size=12.2) for b in bul], spacing=1.08)
rows = [[m["name"], "Claude Code CLI" if m["vendor"] == "Anthropic" else "Codex CLI", m["wallet"][:6] + "…" + m["wallet"][-4:], m["slot"], "%.2f" % PNL[m["key"]]["startCash"]] for m in MODELS]
table(s, 7.3, 1.8, [1.45, 1.15, 1.1, 1.3, 0.85], ["Model", "Runs through", "Wallet", "Pass slot", "Start cash"], rows, size=10, row_h=0.36,
      aligns=[PP_ALIGN.LEFT] * 4 + [PP_ALIGN.RIGHT], mono=(2, 4), colors={(i, 0): MODEL_RGB[m["key"]] for i, m in enumerate(MODELS)}, bolds={(i, 0): True for i in range(4)})
text(s, 7.3, 3.75, 5.5, 0.9, "Cash is sUSDS on Optimism (Spark savings USDS, the markets' collateral). Wallet addresses are public; keys stay in each folder's .env.", size=10, color=MUTED)
rows2 = [[m["q"], m["short"], m["keyOutcome"], "%.0f%%" % (100 * m["ballotShare"])] for m in MARKETS]
table(s, 7.3, 4.55, [0.45, 2.1, 2.05, 0.75], ["#", "Market (all resolve on the NU7 poll)", "Outcome the ballots favored", "Ballots"], rows2, size=10, row_h=0.34, aligns=[PP_ALIGN.LEFT] * 3 + [PP_ALIGN.RIGHT])

# ======================================================================
# 3. TIMELINE
s = content_slide("What happened, hour by hour", "All times UTC. Two calendar days, %d pass reports, %d trades, one result." % (reports_total, len(trades)))
events = [
    ("2026-09-13T13:30Z", "13 Sep 13:30", "Clean start", "Old positions unwound; four wallets hold cash only."),
    ("2026-09-13T16:35Z", "16:35", "First scheduled pass", "Fable 16:35, Opus 16:55, Astra 17:15, Sol 17:35; then every 2 h."),
    ("2026-09-13T18:10Z", "16:58 → 19:27", "%d trades in two cycles" % sum(1 for t in trades if t["t"] < "2026-09-14"), "Feb-2031 goes 0.29 → 0.43, Ship 0.71 → 0.75, Immediately 0.28 → 0.33."),
    ("2026-09-14T00:30Z", "20:35 → 02:55", "Quiet night", "Every pass ends in “no trade”: the remaining edges are under the 5-point floor."),
    ("2026-09-14T04:30Z", "14 Sep 03:29 → 05:33", "Astra adds three small trades", "Its last swap is the last swap on any of the five pools."),
    ("2026-09-14T09:00Z", "05:35 → 14:35", "%d more “no trade” passes" % after, "Estimates barely move; prices do not move at all."),
    ("2026-09-14T12:40Z", "≈ 12:40 · 12:55", "Shutdown and a session limit", "Shutting the PC down kills four running passes; an Opus pass hits the Claude session limit."),
    ("2026-09-14T14:10Z", "13:35 · 14:40", "Liquidity withdrawn, bots stopped", "The wallet that seeded the pools removes all liquidity; scheduled tasks disabled."),
    ("2026-09-14T19:00Z", "19:00", "Poll closes", "Tally published: every ballot leader wins with 96.6–99.9% of about 2.4M ZEC."),
]
x0, x1, yl = 0.9, 12.4, 3.75
t_a, t_b = xs("2026-09-13T12:30Z"), xs("2026-09-14T20:00Z")
rect(s, x0, yl - 0.015, x1 - x0, 0.03, RULE)
for i, (t, when, head, desc) in enumerate(events):
    px = x0 + (xs(t) - t_a) / (t_b - t_a) * (x1 - x0)
    rect(s, px - 0.09, yl - 0.09, 0.18, 0.18, GOLD if i in (2, 4, 8) else NAVY, shape=MSO_SHAPE.OVAL)
    bx = min(max(px - 0.75, 0.45), 12.85 - 1.55)
    block = [dict(text=when, size=9, color=MUTED, font=MONO), dict(text=head, size=10.5, bold=True, before=1), dict(text=desc, size=8.8, color=MUTED, before=1)]
    if i % 2 == 0:
        rect(s, px - 0.008, yl - 0.95, 0.016, 0.85, RULE)
        text(s, bx, yl - 2.35, 1.55, 1.4, block, anchor=MSO_ANCHOR.BOTTOM)
    else:
        rect(s, px - 0.008, yl + 0.1, 0.016, 0.85, RULE)
        text(s, bx, yl + 0.95, 1.55, 1.5, block)
text(s, 0.5, 6.35, 12.3, 0.6, "%d of %d pass reports ended without a trade, including every pass after 14 Sep 05:33 (%d in a row). The bots stopped trading on their own eight hours before the liquidity was withdrawn." % (no_trade_reports, reports_total, after), size=11.5, bold=True)

# ======================================================================
# 4. TRADES
s = content_slide("Every trade that executed", "%d trades, 4 wallets, all on the five NU7 markets. Fills are the real average price paid; spot is the pool price just before." % len(trades))
rows, colors, bolds = [], {}, {}
for i, t in enumerate(trades):
    m = MK[t["market"]]
    size = "%g sUSDS" % t["size"] if t["route"] == "direct" else "%g sets" % t["size"]
    act = t["action"].replace(" (split)", "")
    if t["route"] == "split":
        act += " · split"
    if t["route"] == "fade":
        act += " · split & sell"
    act = act.replace("Ship NU7 as soon as possible, removing any feature not implemented by the September 30th deadline", "Ship NU7 as soon as possible").replace("Delay NU7 until every applicable approved feature is deemed complete", "Delay NU7").replace("February 2031 regardless of the outcome of Q1", "February 2031")
    rows.append([fmt_t(t["t"]), MNAME[t["model"]], m["q"] + " " + m["short"], act, size, "%.4f" % t["fill"] if t["fill"] else "", "%.4f" % t["spot"] if t["spot"] else "", ("%.1f%%" % t["slip"]) if t["slip"] is not None else "", "%.2f" % t["cost"]])
    colors[(i, 1)] = MODEL_RGB[t["model"]]
    bolds[(i, 1)] = True
    if t["slip"] is not None and t["slip"] >= 9:
        colors[(i, 7)] = BAD
table(s, 0.5, 1.75, [1.05, 1.35, 2.05, 3.55, 0.95, 0.8, 0.85, 0.7, 0.95], ["Time (UTC)", "Model", "Market", "Action", "Size", "Avg fill", "Spot before", "Slippage", "Cost sUSDS"], rows,
      size=9.5, hsize=9, row_h=0.305, aligns=[PP_ALIGN.LEFT] * 4 + [PP_ALIGN.RIGHT] * 5, mono=(0, 5, 6, 7, 8), colors=colors, bolds=bolds)
text(s, 0.5, 6.45, 12.3, 0.55, "Direct = buy the outcome token from its pool. Split = mint a complete set for 1 sUSDS each and sell the unwanted legs (the Invalid leg has no pool and is kept). Split & sell = the same, selling the outcome the bot wants to be short. Slippage in red is what a 50-sUSDS order does to a pool this thin. Total cost: %.2f sUSDS." % tot_cost, size=9.5, color=MUTED)

# ======================================================================
# 5. THE RESULT
s = content_slide("The result: every ballot leader won", "Official NU7 tally, published after the poll closed on 14 Sep 19:00 UTC. About 2.4M ZEC took part in each question, above the 1M ZEC participation threshold.")
rows, colors, fills, bolds = [], {}, {}, {}
for i, mk in enumerate(MARKETS):
    k = mk["key"]
    r = RES[k]
    wi = S["real"][k].index(r["winnerLabel"])
    raw = [final_raw(m, k)[winner(k)] for m in MKEYS]
    fv = FINAL_F["perMarket"][k]["vector"]
    top = S["real"][k][fv.index(max(fv))]
    mkt_raw = price_at(k, winner(k), S["pollClose"])
    ok = top == r["winnerLabel"]
    rows.append([mk["q"] + " " + mk["short"], SHORT_OUTCOME.get(r["winnerLabel"], r["winnerLabel"]),
                 "%.2f%%" % (100 * r["zecShareInclAbstain"][wi]), "%.1f%%" % (100 * r["ballotShare"][wi]),
                 "%.2f – %.2f" % (min(raw), max(raw)), "%.3f" % mkt_raw,
                 ("✓ " if ok else "✗ ") + SHORT_OUTCOME.get(top, top) + ("" if ok else " (%.3f)" % price_at(k, OC["markets"][k]["outcomes"].index(top), S["pollClose"]))])
    colors[(i, 6)] = GOOD if ok else BAD
    bolds[(i, 1)] = True
table(s, 0.5, 1.8, [2.35, 2.1, 1.35, 1.45, 1.75, 1.35, 1.95], ["Market", "Winning outcome", "ZEC share (official)", "Ballot share (ex-abstain)", "Agents' final estimate", "Final pool price", "Market's top pick at the close"], rows,
      size=10.5, hsize=9.5, row_h=0.46, hrow_h=0.5, aligns=[PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT, PP_ALIGN.LEFT], mono=(2, 3, 4, 5), colors=colors, bolds=bolds)
text(s, 0.5, 4.75, 12.3, 2.1, [
    dict(text="The weighted vote was far more one-sided than the ballot count. Ballots, which the agents could read live, gave the leaders 58–95%; ZEC weight gave them 96.6–99.9%, so large holders voted with the ballot leaders on every question. The agents had shaded their estimates down for the opposite risk.", bullet=True, after=6),
    dict(text="The pools ended the poll still favoring the wrong outcome on two questions: As soon as possible over February 2031, and No date over Immediately. Every agent had the winner on top in all five.", bullet=True, after=6),
    dict(text="ZEC share is as published on cipherscan.app/governance/nu7, abstentions included; the vote chain's decrypted tally gives the same totals. Not yet settled: none of the five Reality.eth questions has an answer, so no market has resolved.", bullet=True, color=MUTED, size=10.5),
], size=11.5, spacing=1.06)

# ======================================================================
# 6. PROFIT AND LOSS
s = content_slide("Profit and loss: all four agents made money", "Settled on the official tally: winning tokens pay 1 sUSDS each, everything else pays nothing. The tokens are held in the wallets and redeem once the oracle finalizes.")
cx = 0.5
for m in MODELS:
    p = PNL[m["key"]]
    col = MODEL_RGB[m["key"]]
    rect(s, cx, 1.75, 3.0, 2.05, WHITE, line=RULE)
    rect(s, cx, 1.75, 3.0, 0.08, col)
    lines = [
        dict(text=m["name"], size=14, bold=True, color=col, font=HEAD),
        dict(runs=[(sus(p["net"], True), dict(size=26, bold=True, font=HEAD, color=GOOD if p["net"] > 0 else BAD)), ("  sUSDS", dict(size=11, color=MUTED))], before=2),
        dict(text="≈ %s$%.2f" % ("+" if p["netUsd"] >= 0 else "−", abs(p["netUsd"])), size=11, color=INK, before=0),
        dict(text="%+.0f%% on the %.2f put in · %+.1f%% on a %.2f bankroll" % (100 * p["returnOnCost"], p["cost"], 100 * p["returnOnBankroll"], p["startCash"]), size=9.5, color=MUTED, before=6),
        dict(text="Receives %.2f · gas $%.3f over %d transactions" % (p["payoff"], p["gasUsd"], p["gasTxs"]), size=9.5, color=MUTED, before=2),
    ]
    text(s, cx + 0.12, 1.88, 2.78, 1.9, lines)
    cx += 3.1
rows, colors, row_h = [], {}, []
for i, mk in enumerate(MARKETS):
    k = mk["key"]
    row = [[dict(text=mk["q"] + " " + mk["short"], size=10, bold=True), dict(text="won: " + SHORT_OUTCOME.get(RES[k]["winnerLabel"], ""), size=9, color=MUTED)]]
    for j, m in enumerate(MKEYS):
        pm = PNL[m]["perMarket"][k]
        if pm["cost"] == 0 and pm["payoff"] == 0:
            row.append([dict(text="–", size=10, color=MUTED)])
            continue
        held = ", ".join("%g %s" % (round(v, 2), SHORT_OUTCOME.get(o, o)) for o, v in PNL[m]["holdings"][k].items() if not o.startswith("Invalid"))
        row.append([dict(text=sus(pm["net"], True), size=11, bold=True, font=MONO, color=GOOD if pm["net"] > 0 else BAD), dict(text="%s for %.2f" % (held, pm["cost"]), size=8.5, color=MUTED)])
    rows.append(row)
rows.append([[dict(text="Total", size=10, bold=True)]] + [[dict(text=sus(PNL[m]["net"], True), size=11, bold=True, font=MONO, color=GOOD), dict(text="paid %.2f · receives %.2f · gas %.4f" % (PNL[m]["cost"], PNL[m]["payoff"], PNL[m]["gasSusds"]), size=8.5, color=MUTED)] for m in MKEYS])
table(s, 0.5, 3.95, [2.3, 2.5, 2.5, 2.5, 2.5], ["Market", "Claude Fable 5.1", "Claude Opus 5", "GPT-6 Astra", "GPT-5.6 Sol"], rows, size=10, hsize=9.5, row_h=0.4, hrow_h=0.28,
      fills={(5, j): GOOD_BG for j in range(5)})
text(s, 0.5, 6.7, 12.3, 0.3, "Together: %.2f sUSDS put in, %.2f back, %s sUSDS (≈ +$%.0f). USD at %.4f USDS per sUSDS; gas from %d receipts at ETH $%.0f, $%.3f in all." % (tot_cost, tot_pay, sus(tot_net, True), tot_net * S["usdsPerSusds"], S["usdsPerSusds"], tot_gas_txs, S["ethUsd"], tot_gas_usd), size=9.5, color=MUTED)

# ======================================================================
# 7. FORECAST SCORES
s = content_slide("Forecast scores: the agents beat the market", "Each forecast scored against the official result, averaged over the five markets. Accuracy: higher is better. Brier and log loss: lower is better.")
order = AGENT_F + [MEAN_F, SEED_F, PRE_F, FINAL_F, BALLOT_F]
labels = {SEED_F["name"]: "Base rate: opening price (pool seed)", PRE_F["name"]: "Base rate: market before the bots traded", FINAL_F["name"]: "Market rate: final pool price", BALLOT_F["name"]: "Reference: live ballot share"}
scored = [f for f in order if f["kind"] != "reference"]
best_b = min(f["brier"] for f in scored)
best_l = min(f["logloss"] for f in scored)
rows, colors, bolds, fills = [], {}, {}, {}
for i, f in enumerate(order):
    nm = labels.get(f["name"], f["name"])
    when = "final estimates" if f["kind"] == "agents-mean" else fmt_t(f["when"])
    rows.append([nm, when, "%d of 5" % round(5 * f["accuracy"]), "%.3f" % f["brier"], "%.3f" % f["logloss"]])
    if f["kind"] == "agent":
        key = next(m for m in MKEYS if MNAME[m] == f["name"])
        colors[(i, 0)] = MODEL_RGB[key]
        bolds[(i, 0)] = True
    if f["kind"] == "reference":
        for j in range(5):
            colors[(i, j)] = MUTED
    if f["kind"] in ("base", "market"):
        for j in range(5):
            fills[(i, j)] = RGBColor(0xF4, 0xF1, 0xE8) if i % 2 == 0 else RGBColor(0xEC, 0xE8, 0xDC)
    if abs(f["brier"] - best_b) < 1e-9 and f["kind"] != "reference":
        colors[(i, 3)] = GOOD
        bolds[(i, 3)] = True
    if abs(f["logloss"] - best_l) < 1e-9 and f["kind"] != "reference":
        colors[(i, 4)] = GOOD
        bolds[(i, 4)] = True
    if round(5 * f["accuracy"]) < 5:
        colors[(i, 2)] = BAD
table(s, 0.5, 1.8, [3.1, 1.35, 1.0, 0.95, 0.95], ["Forecaster", "Forecast as of", "Accuracy", "Brier", "Log loss"], rows, size=10.5, row_h=0.42,
      aligns=[PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT], mono=(1, 2, 3, 4), colors=colors, bolds=bolds, fills=fills)
rob = S["robustness"]
rank_same = sorted(MKEYS, key=lambda m: rob[m]["brier"]) == sorted(MKEYS, key=lambda m: next(f["brier"] for f in AGENT_F if f["name"] == MNAME[m]))
d_b = [rob[m]["brier"] - next(f["brier"] for f in AGENT_F if f["name"] == MNAME[m]) for m in MKEYS]
rect(s, 8.2, 1.8, 4.63, 4.62, WHITE, line=RULE)
rect(s, 8.2, 1.8, 4.63, 0.08, GOLD)
text(s, 8.35, 1.95, 4.35, 4.45, [
    dict(text="How to read it", size=13, bold=True, font=HEAD),
    dict(runs=[("Accuracy  ", dict(bold=True)), ("markets where the forecaster's most likely outcome won.", {})], size=10.5, before=6, bullet=True),
    dict(runs=[("Brier  ", dict(bold=True)), ("squared error summed over a market's outcomes: 0 is perfect, 2 is certain and wrong. A forecast of 0.72 on a winner in a three-way market with 0.14 on each loser scores 0.12.", {})], size=10.5, before=4, bullet=True),
    dict(runs=[("Log loss  ", dict(bold=True)), ("−ln of the probability given to the winner: 0.72 scores 0.33, 0.33 scores 1.11. It punishes confident misses hardest.", {})], size=10.5, before=4, bullet=True),
    dict(text="Pools do not price Invalid, so every forecast drops its Invalid share and is rescaled to sum to 1. Counting the agents' Invalid share as a losing outcome instead raises their Brier by %.3f–%.3f and %s." % (min(d_b), max(d_b), "changes no ranking" if rank_same else "changes the ranking"), size=10, color=MUTED, before=8),
    dict(text="The ballot share is a public signal, not anyone's forecast, and was not scored for ranking.", size=10, color=MUTED, before=4),
])
text(s, 0.5, 6.25, 7.5, 0.75, "Every agent picked all five winners; every market snapshot picked three. The agents' Brier scores (%.3f–%.3f) are %.0f–%.0f%% of the final market's %.3f. Opus 5 scored best on both measures and was the only agent to beat the raw ballot share." % (agent_briers[0], agent_briers[-1], 100 * agent_briers[0] / FINAL_F["brier"], 100 * agent_briers[-1] / FINAL_F["brier"], FINAL_F["brier"]), size=10.5, bold=True)

# ======================================================================
# 8. SCORES BY MARKET
s = content_slide("Probability given to the winner, market by market", "Higher is better. Shading deepens with the probability; red marks a forecaster whose most likely outcome lost.")
hdr = ["Forecaster"] + ["%s %s" % (mk["q"], SHORT_WIN[mk["key"]]) for mk in MARKETS] + ["Mean"]
rows, fills, colors, bolds = [], {}, {}, {}
for i, f in enumerate(order):
    row = [labels.get(f["name"], f["name"])]
    for j, mk in enumerate(MARKETS):
        pm = f["perMarket"][mk["key"]]
        wrong = pm["accuracy"] < 1
        cell = [dict(text="%.3f" % pm["pWinner"], size=11, font=MONO, bold=True, color=BAD if wrong else INK)]
        if wrong:
            lbl = SHORT_OUTCOME.get(OC["markets"][mk["key"]]["outcomes"][pm["argmax"]], "?")
            cell.append(dict(text="top pick: " + {"As soon as possible": "ASAP"}.get(lbl, lbl), size=8.5, color=BAD))
        row.append(cell)
        fills[(i, j + 1)] = BAD_BG if wrong else mix((0xFF, 0xFF, 0xFF), (0xB9, 0xDF, 0xC6), (pm["pWinner"] - 0.3) / 0.7)
    row.append([dict(text="%.3f" % statistics.mean(f["perMarket"][mk["key"]]["pWinner"] for mk in MARKETS), size=11, font=MONO, bold=True)])
    rows.append(row)
    if f["kind"] == "agent":
        colors[(i, 0)] = MODEL_RGB[next(m for m in MKEYS if MNAME[m] == f["name"])]
        bolds[(i, 0)] = True
    if f["kind"] == "reference":
        colors[(i, 0)] = MUTED
table(s, 0.5, 1.72, [2.9, 1.6, 1.6, 1.6, 1.6, 1.6, 1.4], hdr, rows, size=10.5, hsize=9.5, row_h=0.44, hrow_h=0.32,
      aligns=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 6, fills=fills, colors=colors, bolds=bolds)
text(s, 0.5, 6.38, 12.3, 0.62, "The pools never flipped their top pick on v4 and reissuance. The agents bought the ballot leader there until their position limits or the edge floor stopped them, and one wallet sold complete sets back into the pools after each direct purchase. The agents were least sure where the pools disagreed most (v4: 0.51–0.78).", size=10.5)

# ======================================================================
# 9. SCORES OVER TIME
s = content_slide("Scores over time: trading made the market more accurate", "Mean Brier score over the five markets, recomputed every hour against the final result. Each agent is scored on its latest estimate at that hour; the market on the pool prices at that hour.")
G = [xs(t) for t in ser["grid"]]
series = []
for m in MODELS:
    pts = [(x, v["brier"]) for x, v in zip(G, ser["agents"][m["key"]]) if v]
    series.append(dict(name=m["name"], points=pts, color=MODEL_RGB[m["key"]], width=2, msize=4))
series.append(dict(name="Market (pool prices)", points=list(zip(G, mk_brier)), color=INK, width=3, marker=False))
series.append(dict(name="Opening price", points=[(G[0], ser["seed"]), (G[-1], ser["seed"])], color=SOFT, width=1.5, dash=True, marker=False))
series.append(dict(name="Live ballot share (reference)", points=[(G[0], BALLOT_F["brier"]), (G[-1], BALLOT_F["brier"])], color=GOOD, width=1.5, dot=True, marker=False))
xy_chart(s, 0.4, 1.75, 8.6, 5.2, series, ymin=0, ymax=0.4, yunit=0.1, yfmt="0.00", xmin=xs("2026-09-13T16:00Z"), xmax=xs("2026-09-14T20:00Z"), xunit=0.25)
opus_s = [v["brier"] for v in ser["agents"]["opus-5"] if v]
text(s, 9.2, 1.8, 3.65, 5.1, [
    dict(runs=[("Market  ", dict(bold=True)), ("%.3f → %.3f" % (ser["pre"], mk_brier[-1]), dict(font=MONO))], size=11),
    dict(text="The pools' error fell %.0f%% from the moment before the first bot trade to the close. %.0f%% of that drop came by 20:00 on 13 Sep, in the first three hours of bot trading; after that the price barely moved." % (100 * (ser["pre"] - mk_brier[-1]) / ser["pre"], 100 * drop_share), size=10.5, color=MUTED, before=2),
    dict(runs=[("Agents  ", dict(bold=True)), ("%.3f – %.3f" % (min(min(x["brier"] for x in v if x) for v in ser["agents"].values()), max(max(x["brier"] for x in v if x) for v in ser["agents"].values())), dict(font=MONO))], size=11, before=12),
    dict(text="Every agent was more accurate than the market at every hour, from its first estimate on.", size=10.5, color=MUTED, before=2),
    dict(runs=[("Opus 5  ", dict(bold=True)), ("%.3f → %.3f" % (opus_s[0], opus_s[-1]), dict(font=MONO))], size=11, before=12),
    dict(text="The best forecaster got slightly worse over time: it cut Preserve halvings from 0.83 to 0.72 as Do-not-include gained ballots.", size=10.5, color=MUTED, before=2),
    dict(runs=[("Base rates  ", dict(bold=True)), ("opening %.3f · before the bots %.3f" % (ser["seed"], ser["pre"]), dict(font=MONO))], size=11, before=12),
])

# ======================================================================
# 10. PARTICIPATION MATRIX
s = content_slide("Where the bots did not trade, and why", "No market went untouched, but two of the five drew a single trade under 9 sUSDS. The reasons below are the bots' own, quoted from their pass reports.")
REASON = {
    ("zip218", "fable-5.1"): "Yes edge 0.8 pts at spot, negative beyond 10 sUSDS; the No pool (8.9 sUSDS of collateral) is too shallow to fade.",
    ("zip218", "opus-5"): "Yes clears only 5 sUSDS at 0.882; a 50-sUSDS order fills near 0.90 and leaves ~2 pts. Structural, not a close call.",
    ("zip218", "astra-gpt-6"): "1-sUSDS Yes fills 0.8805, 1.7 pts of edge; a 1-set fade of No fills 0.895, 3.3 pts. Both under the floor.",
    ("zip218", "gpt-5.6-sol"): "Shorted No for 8.88 sUSDS at 0.887, the most the pool could absorb. Afterwards the best Yes fill left 4.3 pts.",
    ("smoothing", "fable-5.1"): "Bought 10 sets of Do-not-include for 1.44 sUSDS. Later passes: best line 2.8 pts (Not-in-NU7), short Smooth 3.2 pts.",
    ("smoothing", "opus-5"): "Own 0.72–0.83 for Preserve vs 0.71 spot, but the Preserve pool is so thin the plan shows 0.9 pts after fill and negative beyond.",
    ("smoothing", "astra-gpt-6"): "10-set Exclude split fills 0.155 for 3.6 pts of edge; nothing else clears. Wording risk and whale concentration noted.",
    ("smoothing", "gpt-5.6-sol"): "Defer expression 3.6 pts, Preserve fade 4.3 pts; both below the 5-point floor.",
    ("features", "fable-5.1"): "Shorted Delay: 50 sets, fill 0.787 (edge 5.4 pts).",
    ("features", "opus-5"): "Bought Ship for 50 sUSDS at 0.734 (ballots 87.9% Ship).",
    ("features", "astra-gpt-6"): "Bought 9 sets of Ship at 0.753 on the third cycle.",
    ("features", "gpt-5.6-sol"): "Bought Ship for 10 sUSDS at 0.710 (edge 5.4 pts).",
    ("v4", "fable-5.1"): "Own 0.50 for Immediately but only 40% weight on itself (“a coin-flip on purpose”: the market where Feb-poll whales matter most). Best line 2 sUSDS at 5.2 pts, dropped once the common factor is applied.",
    ("v4", "opus-5"): "Bought Immediately for 50 sUSDS at 0.310 (own 0.77).",
    ("v4", "astra-gpt-6"): "Bought 10 sets of Immediately at 0.368 on the third cycle.",
    ("v4", "gpt-5.6-sol"): "Bought 50 sets of Immediately at 0.347.",
    ("reissuance", "fable-5.1"): "Bought 100 sets of Feb-2031 at 0.384 (own 0.65 vs 0.35 spot).",
    ("reissuance", "opus-5"): "Bought Feb-2031 for 50 sUSDS at 0.394 (own 0.82).",
    ("reissuance", "astra-gpt-6"): "Bought 25 then 30 sets of Feb-2031 (0.433, 0.448); a further add was blocked by its own exposure cap.",
    ("reissuance", "gpt-5.6-sol"): "Bought Feb-2031 for 50 sUSDS at 0.331 (own 0.68).",
}
traded = {(t["market"], t["model"]) for t in trades}
rows, fills, colors = [], {}, {}
for i, mk in enumerate(MARKETS):
    n = sum(1 for m in MKEYS if (mk["key"], m) in traded)
    row = [[mk["q"] + " " + mk["short"], "%d of 4 traded" % n]]
    for j, m in enumerate(MKEYS):
        did = (mk["key"], m) in traded
        row.append(("TRADED · " if did else "NO TRADE · ") + REASON[(mk["key"], m)])
        fills[(i, j + 1)] = GOOD_BG if did else FAINT
        colors[(i, j + 1)] = INK if did else MUTED
    rows.append(row)
table(s, 0.5, 1.75, [1.75, 2.65, 2.65, 2.65, 2.65], ["Market", "Claude Fable 5.1", "Claude Opus 5", "GPT-6 Astra", "GPT-5.6 Sol"], rows, size=8.6, hsize=9.5, row_h=0.84, hrow_h=0.32, fills=fills, colors=colors, aligns=[PP_ALIGN.LEFT] * 5, bolds={(i, 0): True for i in range(5)})
text(s, 0.5, 6.42, 12.3, 0.62, "Two reasons recur. Thin pools: on ZIP-218 and smoothing the pools held so little that the first few sUSDS moved the price past the 5-point edge floor (the code measures edge against the real fill, not the quote). Already priced: ZIP-218 Yes opened at 0.90 against ballots at 95%, so even a 0.96 estimate leaves nothing after fill and the Invalid risk.", size=10)

# ======================================================================
# 11. SECTION: CONVERGENCE
section_slide("Did the four models converge?", [
    dict(text="Five charts, one per market. Each colored line is one model's probability for the outcome that won (it was also the ballot leader on every question), taken from every pass report it wrote. The black line is that outcome's pool price, rebuilt swap by swap from the pool's onchain events up to the poll close. The dashed line is the live ballot share (ex-abstain). The diamond is the seed price the market opened at.", size=14, color=RGBColor(0xC9, 0xCF, 0xD8), after=10),
    dict(text="Convergence means two things here: the four lines getting closer to each other, and the black line moving toward them.", size=14, color=WHITE, bold=True),
])

# ======================================================================
# 12-16. PER-MARKET CHARTS
for mk in MARKETS:
    k = mk["key"]
    w = winner(k)
    s = content_slide("%s · %s" % (mk["q"], mk["short"]), "Probability of “%s”, the outcome that won · %s" % (mk["keyOutcome"], mk["title"]))
    series = []
    for m in MODELS:
        series.append(dict(name=m["name"], points=[(xs(t), v) for t, v in estimate_series(m["key"], k)], color=MODEL_RGB[m["key"]], width=2))
    series.append(dict(name="Pool price", points=price_steps(k, w, "2026-09-13T12:00:00Z", S["pollClose"]), color=INK, width=2.75, marker=False))
    series.append(dict(name="Ballots (live, ex-abstain)", points=[(XMIN, mk["ballotShare"]), (XMAX, mk["ballotShare"])], color=SOFT, width=1.5, dash=True, marker=False))
    series.append(dict(name="Seed price", points=[(XMIN + 0.02, mk["seed"])], color=MUTED, width=0.1, mstyle=XL_MARKER_STYLE.DIAMOND, msize=10))
    xy_chart(s, 0.4, 1.7, 8.55, 5.2, series)
    rx = 9.15
    rows, colors = [], {}
    for i, m in enumerate(MODELS):
        es = [v for _, v in estimate_series(m["key"], k)]
        rows.append([m["name"], "%.2f" % es[0], "%.2f" % es[-1], "%+.2f" % (es[-1] - es[0])])
        colors[(i, 0)] = MODEL_RGB[m["key"]]
    table(s, rx, 1.75, [1.55, 0.7, 0.7, 0.75], ["Model estimate", "First", "Last", "Change"], rows, size=10, row_h=0.32, aligns=[PP_ALIGN.LEFT] + [PP_ALIGN.RIGHT] * 3, mono=(1, 2, 3), colors=colors, bolds={(i, 0): True for i in range(4)})
    wl = WIN[k]
    nt = [t for t in trades if t["market"] == k]
    r = RES[k]
    wi = S["real"][k].index(r["winnerLabel"])
    final_p = price_at(k, w, S["pollClose"])
    lines = [
        dict(runs=[("Result  ", dict(bold=True, color=GOOD)), ("won with %.1f%% of ZEC" % (100 * r["zecShareInclAbstain"][wi]), dict(color=GOOD, bold=True)), ("  (%.1f%% of ballots)" % (100 * r["ballotShare"][wi]), dict(color=MUTED))], size=10.5, before=6),
        dict(runs=[("Pool price  ", dict(bold=True)), ("%.3f → %.3f" % (mk["seed"], final_p), dict(font=MONO)), ("  seed to close (%+.1f pts)" % (100 * (final_p - mk["seed"])), dict(color=MUTED))], size=10.5, before=5),
        dict(runs=[("Activity  ", dict(bold=True)), ("%d swaps · %.0f sUSDS · %d wallets" % (mk["swaps"], mk["volume"], mk["traders"]), dict(font=MONO)), ("  since creation", dict(color=MUTED))], size=10.5, before=5),
        dict(runs=[("Our trades  ", dict(bold=True)), ("%d by %d bot%s, %.2f sUSDS" % (len(nt), len({t["model"] for t in nt}), "" if len({t["model"] for t in nt}) == 1 else "s", sum(t["cost"] for t in nt)), dict(font=MONO))], size=10.5, before=5),
    ]
    if wl:
        lines.append(dict(runs=[("Spread of the four estimates  ", dict(bold=True)), ("%.3f → %.3f" % (wl[0]["sd"], wl[-1]["sd"]), dict(font=MONO)), ("  (std. dev., first → last cycle with all four)", dict(color=MUTED))], size=10.5, before=5))
        lines.append(dict(runs=[("Mean distance to the pool price  ", dict(bold=True)), ("%.3f → %.3f" % (wl[0]["gap"], wl[-1]["gap"]), dict(font=MONO))], size=10.5, before=5))
    text(s, rx, 3.45, 3.75, 3.45, lines)

# ======================================================================
# 17. DISPERSION
s = content_slide("Convergence in two numbers", "Left: how far apart the four models are (standard deviation of their estimates for the winner). Right: how far the models sit from the pool price. Each point is a two-hour cycle where all four estimates are under 4.5 h old.")
MC = {"zip218": RGBColor(0x1B, 0x7F, 0x63), "smoothing": RGBColor(0x7A, 0x2E, 0x8C), "features": RGBColor(0xC4, 0x55, 0x2A), "v4": RGBColor(0x2F, 0x6F, 0xD6), "reissuance": RGBColor(0xD9, 0xA2, 0x1B)}
sd_series = [dict(name=mk["q"] + " " + mk["short"], points=[(xs(x["t"]), x["sd"]) for x in WIN[mk["key"]]], color=MC[mk["key"]], width=2) for mk in MARKETS]
gap_series = [dict(name=mk["q"] + " " + mk["short"], points=[(xs(x["t"]), x["gap"]) for x in WIN[mk["key"]]], color=MC[mk["key"]], width=2) for mk in MARKETS]
DX0, DX1 = xs("2026-09-13T12:00Z"), xs("2026-09-14T18:00Z")
xy_chart(s, 0.4, 1.95, 6.2, 4.6, sd_series, ymin=0, ymax=0.15, yunit=0.05, yfmt="0.00", xunit=0.5, xmin=DX0, xmax=DX1)
xy_chart(s, 6.75, 1.95, 6.2, 4.6, gap_series, ymin=0, ymax=0.45, yunit=0.15, yfmt="0.00", xunit=0.5, xmin=DX0, xmax=DX1)
text(s, 0.5, 1.6, 6, 0.35, "Spread between the four models (std. dev. of estimates)", size=11, bold=True)
text(s, 6.85, 1.6, 6, 0.35, "Mean |model estimate − pool price|", size=11, bold=True)
sd_down = [mk for mk in MARKETS if WIN[mk["key"]][-1]["sd"] < WIN[mk["key"]][0]["sd"] - 1e-9]
gap_down = [mk for mk in MARKETS if WIN[mk["key"]][-1]["gap"] < WIN[mk["key"]][0]["gap"] - 1e-9]
gap_up = [mk for mk in MARKETS if mk not in gap_down]
def names(lst):
    qs = [x["q"] for x in lst]
    return qs[0] if len(qs) == 1 else ", ".join(qs[:-1]) + " and " + qs[-1]


text(s, 0.5, 6.55, 12.3, 0.45, "The spread narrows on %s markets. The distance to price falls on %s%s. Where the gap stays large (Q2, Q3), the price was what was wrong: both resolved to the outcome the models had put above the price." % ("all five" if len(sd_down) == 5 else "%d of the five" % len(sd_down), names(gap_down), (" and rises on " + names(gap_up) + ", where the price stopped moving while models raised their estimates") if gap_up else ""), size=9.5, color=MUTED)

# ======================================================================
# 18. FINDINGS
s = content_slide("What the data shows", "Two days, five markets on one poll, thin pools. Within those limits the picture is consistent.")
best_pnl = max(MKEYS, key=lambda m: PNL[m]["net"])
fl = ["%s %s: spread %.3f → %.3f, distance to price %.3f → %.3f" % (mk["q"], mk["short"], WIN[mk["key"]][0]["sd"], WIN[mk["key"]][-1]["sd"], WIN[mk["key"]][0]["gap"], WIN[mk["key"]][-1]["gap"]) for mk in MARKETS]
bul = [
    dict(runs=[("The agents picked every winner; the market picked three of five. ", dict(bold=True)), ("All four agents had the winner on top in all five markets; the opening price, the market before the bots traded and the final price each had it on top in three. Brier: agents %.3f–%.3f, final market %.3f, market before the bots %.3f." % (agent_briers[0], agent_briers[-1], FINAL_F["brier"], PRE_F["brier"]), {})], bullet=True, after=6),
    dict(runs=[("Trading moved the market toward the truth. ", dict(bold=True)), ("The pools' Brier fell %.0f%%, almost all of it in the first three hours of bot trading. February 2031 went 0.29 → 0.43, Ship 0.71 → 0.75, Immediately 0.28 → 0.33." % (100 * (ser["pre"] - mk_brier[-1]) / ser["pre"]), {})], bullet=True, after=6),
    dict(runs=[("All four made money, %s sUSDS on %.2f put in. " % (sus(tot_net, True), tot_cost), dict(bold=True)), ("Opus 5 scored best and earned most (%s). Astra scored second but earned least (%s) because it risked only %.2f. Sol earned second most by buying February 2031 at 0.33." % (sus(PNL["opus-5"]["net"], True), sus(PNL["astra-gpt-6"]["net"], True), PNL["astra-gpt-6"]["cost"]), {})], bullet=True, after=6),
    dict(runs=[("The four models converged. ", dict(bold=True)), ("The spread between their estimates fell on %s markets between the first and the last cycle with all four present:" % ("all five" if len(sd_down) == 5 else str(len(sd_down))), {})], bullet=True, after=2),
]
text(s, 0.5, 1.65, 12.3, 2.0, bul, size=11.8, spacing=1.05)
text(s, 0.85, 3.72, 11.8, 1.2, [dict(text=x, size=10, font=MONO, after=1) for x in fl])
text(s, 0.5, 5.0, 12.3, 1.4, [
    dict(runs=[("Their main error was caution. ", dict(bold=True)), ("Every agent discounted the ballot leads for large ZEC holders who might vote the other way, and added 1–5%% for Invalid. Large holders voted with the leaders, so the plain ballot share scored %.3f, better than three of the four agents. The process was self-limiting: %d of %d pass reports ended without a trade." % (BALLOT_F["brier"], no_trade_reports, reports_total), {})], bullet=True),
], size=11.8, spacing=1.05)

# ======================================================================
# 19. CAVEATS & NEXT
s = content_slide("Caveats, and what happens next")
cav = [
    dict(text="One event, not five tests. The five markets resolved on one poll and the same large holders decided every question. Five correct picks and four profitable wallets say little about skill in general.", bullet=True, after=6),
    dict(text="Thin pools and one arbitrageur. %d swaps in the markets' whole life; %d of them came from one wallet (%s…%s) that split sUSDS into complete sets and sold every outcome right after bot trades, in %d transactions. Final prices reflect four agents and that wallet." % (swaps_total, arb_addr[1], arb_addr[0][:6], arb_addr[0][-4:], arb_txs), bullet=True, after=6),
    dict(text="Not yet redeemed. P&L assumes the oracle resolves to the published tally. No answer has been posted to any of the five Reality.eth questions; an answer needs a 0.005 ETH bond and finalizes 84 hours after the last one if nobody disputes it.", bullet=True, after=6),
    dict(text="Frozen prices. The wallet that seeded the pools (%s…%s) removed all liquidity at 13:35 UTC on 14 Sep; the last swap was at 05:33. The “final price” is that last swap's price." % (seeder[:6], seeder[-4:]), bullet=True, after=6),
    dict(text="Operational losses: a PC shutdown killed four running passes, one Opus pass hit the Claude session limit, one Opus pass finished without saving a report, and four first-cycle trades failed on RPC rate limits with no partial positions (appendix).", bullet=True),
]
text(s, 0.5, 1.4, 6.95, 5.55, cav, size=11.2, spacing=1.05)
rect(s, 7.8, 1.4, 5.0, 4.55, WHITE, line=RULE)
rect(s, 7.8, 1.4, 5.0, 0.08, GOLD)
text(s, 7.95, 1.6, 4.7, 5.05, [
    dict(text="Next", size=15, bold=True, font=HEAD),
    dict(text="Answer the oracle · someone posts the published outcome to each Reality.eth question (0.005 ETH bond each). Anyone can do it, including the market creator.", size=10.5, before=8, bullet=True),
    dict(text="84 hours later · each unchallenged answer finalizes and the market reports its payout.", size=10.5, before=4, bullet=True),
    dict(text="Redeem · run npm run redeem in each bot folder for each market it holds. That turns the %.2f winning tokens into sUSDS and makes the P&L on slide 6 final." % tot_pay, size=10.5, before=4, bullet=True),
    dict(text="Scheduled passes stay disabled; nothing will trade unless they are re-enabled.", size=10.5, before=4, bullet=True),
    dict(text="Sources", size=15, bold=True, font=HEAD, before=12),
    dict(text="Tally: Valar vote chain (decrypted) and cipherscan.app/governance/nu7. Onchain: every pool event, wallet balance and gas receipt, read from Optimism. Forecasts: %d pass reports. Everything is recomputed by the scripts in reports/nu7-experiment/." % reports_total, size=9.5, before=4, color=MUTED),
])

# ======================================================================
# 20. APPENDIX: FAILED SENDS
s = content_slide("Appendix · attempts that did not execute", "Queued by a pass but not filled. None left a partial position (each was verified onchain).")
rows = [[fmt_t(f["t"]), MNAME[f["model"]], MK[f["market"]]["q"] + " " + MK[f["market"]]["short"], f["route"], f["size"], f["reason"][:120]] for f in failed]
table(s, 0.5, 1.75, [1.05, 1.4, 2.0, 0.8, 0.8, 6.25], ["Queued (UTC)", "Model", "Market", "Route", "Size", "What happened"], rows, size=9.5, row_h=0.5, aligns=[PP_ALIGN.LEFT] * 6, mono=(0, 4))
text(s, 0.5, 4.2, 12.3, 1.2, [
    dict(text="First-cycle failures were the public Optimism RPC rate-limiting the send path (the approval landed, the swap was never sent). A dedicated RPC key and retry logic were added before the second cycle; no send failed after that.", size=10.5, color=MUTED, after=4),
    dict(text="Ten items from the pre-schedule test passes (13 Sep 15:02 and 16:08) were discarded as stale before the schedule was armed; they are not trades and are not counted anywhere in this deck.", size=10.5, color=MUTED),
])

# ======================================================================
# 21. APPENDIX: SCORES BY MARKET
s = content_slide("Appendix · Brier score and log loss by market", "The per-market numbers behind slide 7. Lower is better; the mean is over the five markets. Red marks a market where that forecaster's most likely outcome lost.")
for ti, (metric, label, y) in enumerate((("brier", "Brier score", 1.7), ("logloss", "Log loss", 4.35))):
    rows, colors, fills = [], {}, {}
    for i, f in enumerate(order):
        row = [labels.get(f["name"], f["name"])] + ["%.3f" % f["perMarket"][mk["key"]][metric] for mk in MARKETS] + ["%.3f" % f[metric]]
        rows.append(row)
        if f["kind"] == "agent":
            colors[(i, 0)] = MODEL_RGB[next(m for m in MKEYS if MNAME[m] == f["name"])]
        if f["kind"] == "reference":
            for j in range(7):
                colors[(i, j)] = MUTED
        for j, mk in enumerate(MARKETS):
            if f["perMarket"][mk["key"]]["accuracy"] < 1:
                colors[(i, j + 1)] = BAD
    table(s, 0.5, y, [3.2, 1.35, 1.35, 1.35, 1.35, 1.35, 1.25], [label] + ["%s %s" % (mk["q"], SHORT_WIN[mk["key"]]) for mk in MARKETS] + ["Mean"], rows, size=9, hsize=9, row_h=0.245, hrow_h=0.27,
          aligns=[PP_ALIGN.LEFT] + [PP_ALIGN.RIGHT] * 6, mono=(1, 2, 3, 4, 5, 6), colors=colors)

# ======================================================================
# 22. APPENDIX: METHOD
s = content_slide("Appendix · how the numbers were computed", "Every figure in this deck is recomputed from public data by the scripts in reports/nu7-experiment/.")
left = [
    dict(text="Result", size=13, bold=True, font=HEAD),
    dict(text="Decrypted tally from the Valar vote chain (tally-results for the NU7 round); one tally unit is 0.125 ZEC, which reproduces cipherscan.app to the digit. Winner = most ZEC among the non-abstain options. Ballot shares exclude abstentions.", size=10, before=3, after=8),
    dict(text="Positions, cash and costs", size=13, bold=True, font=HEAD),
    dict(text="Outcome-token and sUSDS balances read onchain for each wallet at block %s. Each trade's cost is the wallet's sUSDS before minus after in its trade log; for every wallet the costs add up exactly to start cash minus cash now." % OC["latestBlock"], size=10, before=3, after=8),
    dict(text="P&L", size=13, bold=True, font=HEAD),
    dict(text="Winning tokens × 1 sUSDS − cost − gas. Gas is L2 execution plus L1 data fee from %d receipts, converted at the Chainlink ETH/USD price and %.4f USDS per sUSDS." % (tot_gas_txs, S["usdsPerSusds"]), size=10, before=3, after=8),
    dict(text="Prices", size=13, bold=True, font=HEAD),
    dict(text="%d Initialize, Swap, Mint and Burn events on the 14 outcome pools, from creation to block %s. A pool's price at any moment is the price after its last swap (or its seed). Market probabilities divide each outcome's price by the sum of the market's prices." % (len(OC["events"]), OC["latestBlock"]), size=10, before=3),
]
text(s, 0.5, 1.65, 6.0, 5.3, left, spacing=1.04)
right = [
    dict(text="Forecasts", size=13, bold=True, font=HEAD),
    dict(text="Every ESTIMATE line in the %d pass reports from the first scheduled pass on, parsed outcome by outcome; each vector sums to 1 within 0.06 and none failed to parse. An agent's final forecast is its last report before the close. Fable's last report (14:35) was written in full before the bots were stopped; its estimates match its 10:35 report." % reports_total, size=10, before=3, after=8),
    dict(text="Scores", size=13, bold=True, font=HEAD),
    dict(text="Invalid dropped and the rest rescaled to 1 for every forecaster. Accuracy = 1 if the top outcome won. Brier = Σ (p − outcome)² over a market's outcomes. Log loss = −ln p(winner). Each averaged over the five markets. Base rates: seed prices from the pools' Initialize events, and pool prices one second before the first bot swap (13 Sep 16:58:31). Market rate: pool prices at the close.", size=10, before=3, after=8),
    dict(text="Convergence", size=13, bold=True, font=HEAD),
    dict(text="Every two hours, each model's latest estimate for the winner made in the previous 4.5 hours; cycles missing a model are skipped. Spread = population standard deviation of the four. Distance = mean absolute gap to the winner's raw pool price.", size=10, before=3),
]
text(s, 6.85, 1.65, 6.0, 5.3, right, spacing=1.04)

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
print("reports", reports_total, "trading passes", len(trade_passes), "no-trade", no_trade_reports, "after last trade", after)
for mk in MARKETS:
    wl = WIN[mk["key"]]
    print(mk["key"], "windows", len(wl), "sd %.3f -> %.3f" % (wl[0]["sd"], wl[-1]["sd"]), "gap %.3f -> %.3f" % (wl[0]["gap"], wl[-1]["gap"]), wl[0]["t"], wl[-1]["t"])
