"""Builds the Q3 grants round deck: Grants-Q3-five-model-experiment.pptx

Same approach as the NU7 deck: python-pptx with native charts so the boss can edit them, default Office theme,
fonts that ship with Windows. Verified afterwards by exporting every slide to PNG through PowerPoint COM.
"""

import json
import os

from pptx import Presentation
from pptx.chart.data import CategoryChartData, XyChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "scores.json"), encoding="utf-8"))
SUM = json.load(open(os.path.join(HERE, "summary.json"), encoding="utf-8"))

INK = RGBColor(0x1A, 0x1A, 0x1A)
MUTED = RGBColor(0x6B, 0x6B, 0x6B)
RULE = RGBColor(0xD8, 0xD8, 0xD8)
ACCENT = RGBColor(0x1F, 0x5C, 0x9E)
GOOD = RGBColor(0x1E, 0x7A, 0x4B)
BAD = RGBColor(0xA8, 0x32, 0x32)
GREY = RGBColor(0x9A, 0x9A, 0x9A)

# measured: start was 900.00 for every wallet, NU7 proceeds collected during the round are excluded
PNL = [
    # bot, label, cash now, NU7 excluded, collected 4 Oct, markets paid, markets held
    ("opus-5", "Opus 5", 1620.64, 356.44, 932.75, 26, 36),
    ("fable-5.1", "Fable 5.1", 1330.74, 150.00, 630.20, 21, 28),
    ("gpt-5.6-sol", "Sol (GPT-5.6)", 1315.61, 224.23, 635.63, 19, 30),
    ("astra-gpt-6b", "Astra (GPT-6b)", 1123.17, 74.00, 251.05, 11, 15),
    ("jev", "Jev", 856.36, 0.00, 313.27, 15, 35),
]
NAMES = {"opus-5": "Opus 5", "fable-5.1": "Fable 5.1", "gpt-5.6-sol": "Sol (GPT-5.6)", "astra-gpt-6b": "Astra (GPT-6b)", "jev": "Jev",
         "market (closing pool price)": "Market (closing price)", "always 50/50": "Always 50/50"}
pnl_of = {b: cash - 900.0 - nu7 for b, _, cash, nu7, _, _, _ in PNL}

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]


def text(slide, x, y, w, h, s, size=14, bold=False, color=INK, font="Segoe UI", align=PP_ALIGN.LEFT, space=4):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    # a blank line starts a paragraph; a single newline is only how the source string wraps, so let the box rewrap
    paras = [" ".join(part.split(chr(10))) for part in s.split(chr(10) * 2)]
    for i, line in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space)
        r = p.add_run()
        r.text = line
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font
    return tb


def head(slide, title, kicker=None):
    text(slide, 0.6, 0.42, 12.2, 0.8, title, size=30, bold=True, font="Bahnschrift")
    if kicker:
        text(slide, 0.62, 1.18, 12.2, 0.5, kicker, size=13, color=MUTED)
    ln = slide.shapes.add_shape(1, Inches(0.62), Inches(1.62), Inches(12.1), Emu(9525))
    ln.fill.solid()
    ln.fill.fore_color.rgb = RULE
    ln.line.fill.background()
    ln.shadow.inherit = False


def table(slide, x, y, w, rows, widths=None, size=11, header_size=10, row_h=0.32):
    nr, nc = len(rows), len(rows[0])
    shape = slide.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(w), Inches(row_h * nr))
    t = shape.table
    if widths:
        total = sum(widths)
        for i, frac in enumerate(widths):
            t.columns[i].width = Emu(int(Inches(w) * frac / total))
    for ri, row in enumerate(rows):
        t.rows[ri].height = Inches(row_h)
        for ci, val in enumerate(row):
            cell = t.cell(ri, ci)
            cell.text = ""
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT if ci and not str(val).startswith(("W", "Z", "I", "O", "T", "F", "C", "B", "S", "A", "G", "E", "L", "l", "z")) else PP_ALIGN.LEFT
            r = p.add_run()
            r.text = str(val)
            r.font.size = Pt(header_size if ri == 0 else size)
            r.font.bold = ri == 0
            r.font.name = "Consolas" if ri and ci else "Segoe UI"
            r.font.color.rgb = INK
            cell.margin_top = cell.margin_bottom = Pt(1)
    return t


def style_chart(chart, size=11, legend=False):
    chart.font.size = Pt(size)
    chart.font.name = "Segoe UI"
    chart.has_legend = legend
    if legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False


# ---------------------------------------------------------------- 1 title
s1 = prs.slides.add_slide(BLANK)
text(s1, 0.9, 2.1, 11.6, 1.2, "Zcash Q3 Coinholder Retroactive Grants", size=40, bold=True, font="Bahnschrift")
text(s1, 0.95, 3.25, 11.6, 0.9, "Five models, 37 markets, 900 sUSDS each — forecasting skill and trading result", size=18, color=MUTED)
text(s1, 0.95, 4.35, 11.6, 1.6,
     "Round traded 16–29 September 2026 on Seer (Optimism) · vote closed 29 Sep 20:00 UTC\n"
     "145,435 ballots · 17 of 37 proposals accepted by ZEC weight · redeemed 4 October",
     size=13, color=INK)
text(s1, 0.95, 6.5, 11.6, 0.4, "Scores exclude every earlier round: each wallet started this round at exactly 900.00 sUSDS.", size=11, color=MUTED)

# ---------------------------------------------------------------- 2 the round
s2 = prs.slides.add_slide(BLANK)
head(s2, "The round, and the twist that decided it", "Unweighted ballots said yes; ZEC weight said no on twenty proposals")
acc_b = sum(t["ballotsAccept"] for t in S["truth"].values())
rej_b = sum(t["ballotsReject"] for t in S["truth"].values())
text(s2, 0.62, 1.9, 5.9, 3.4,
     "37 binary markets, one per grant proposal: Yes / No / Invalid.\n\n"
     "Ballots across all questions ran %.0f%% accept (%s accept vs %s reject).\n\n"
     "By ZEC weight only 17 of 37 passed. Roughly 2 million ZEC voted reject on almost every consumer\n"
     "application, while protocol security work passed near-unanimously.\n\n"
     "Every bot had the live ballot counts all round — the Valar vote chain publishes them — but the ZEC\n"
     "weight stayed encrypted until after the close." % (100 * acc_b / (acc_b + rej_b), f"{acc_b:,}", f"{rej_b:,}"),
     size=13)
cd = CategoryChartData()
cd.categories = ["Accepted", "Rejected"]
cd.add_series("by ZEC weight", (17, 20))
cd.add_series("by ballot majority", (sum(1 for t in S["truth"].values() if t["ballotsAccept"] > t["ballotsReject"]),
                                     sum(1 for t in S["truth"].values() if t["ballotsAccept"] <= t["ballotsReject"])))
gf = s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(6.9), Inches(1.95), Inches(5.9), Inches(4.6), cd)
style_chart(gf.chart, legend=True)
gf.chart.plots[0].has_data_labels = True
gf.chart.plots[0].data_labels.font.size = Pt(11)

# ---------------------------------------------------------------- 3 money
s3 = prs.slides.add_slide(BLANK)
head(s3, "Result: grants round only", "Cash now minus the 900 start minus NU7 proceeds collected during the round")
rows = [("bot", "stake", "collected", "cash now", "P&L", "return", "paid/held")]
for b, label, cash, nu7, coll, paid, held in PNL:
    stake = 900.0 + nu7 - (cash - coll)
    rows.append((label, "%.0f" % stake, "%.2f" % coll, "%.2f" % cash,
                 ("%+.2f" % pnl_of[b]), "%+.1f%%" % (100 * pnl_of[b] / 900), "%d/%d" % (paid, held)))
table(s3, 0.62, 2.0, 6.2, rows, widths=[2.0, 0.9, 1.15, 1.15, 1.15, 0.95, 1.3], row_h=0.36)
cd = CategoryChartData()
cd.categories = [label for _, label, *_ in PNL]
cd.add_series("grants P&L, sUSDS", tuple(pnl_of[b] for b, *_ in PNL))
gf = s3.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(7.2), Inches(1.95), Inches(5.6), Inches(3.4), cd)
style_chart(gf.chart)
gf.chart.plots[0].has_data_labels = True
gf.chart.plots[0].data_labels.number_format = "+#,##0;-#,##0"
gf.chart.plots[0].data_labels.number_format_is_linked = False
gf.chart.plots[0].data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
text(s3, 0.62, 4.5, 6.2, 2.4,
     "Four of five made money. The fleet put 2,023 sUSDS at risk and finished +941.85, or +20.9% on the\n"
     "4,500 staked.\n\n"
     "Opus deployed the most and collected the most (932.75 from 26 markets). Fable returned the most per\n"
     "unit risked — 630.20 on a 349 stake. Astra barely played: 15 markets, 11 of them paying.", size=12)
text(s3, 7.25, 5.5, 5.6, 1.2, "Jev is the only loss, and the only bot that never adds to or unwinds a position:\none trade per market, held to resolution whatever the ballots did next.", size=12, color=BAD)

# ---------------------------------------------------------------- 4 Brier
s4 = prs.slides.add_slide(BLANK)
head(s4, "Forecast accuracy: Brier score", "(p − outcome)² averaged over 37 markets; Invalid dropped and renormalised, as in the NU7 deck. Lower is better.")
order = sorted([f for f in S["forecasters"]], key=lambda f: f["brier"])
cats, vals, colors = [], [], []
for f in order:
    cats.append(NAMES.get(f["name"], f["name"]) + ("" if f["n"] == 37 else " (%d)" % f["n"]))
    vals.append(round(f["brier"], 4))
    colors.append(GREY if f["name"] in ("always 50/50",) else (ACCENT if "market" in f["name"] else GOOD))
cd = CategoryChartData()
cd.categories = cats
cd.add_series("Brier", tuple(vals))
gf = s4.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.7), Inches(1.95), Inches(7.4), Inches(4.7), cd)
style_chart(gf.chart)
plot = gf.chart.plots[0]
plot.has_data_labels = True
plot.data_labels.number_format = "0.000"
plot.data_labels.number_format_is_linked = False
plot.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
for pt, col in zip(plot.series[0].points, colors):
    pt.format.fill.solid()
    pt.format.fill.fore_color.rgb = col
text(s4, 8.4, 2.0, 4.4, 4.6,
     "Every bot with a full estimate set beat the market's own closing prices (0.163).\n\n"
     "Jev scored best at 0.030 — the plain classifier, asked one question per market, with no research loop\n"
     "at all.\n\n"
     "Fable leaned the right way on all 37 (accuracy 1.00) and Sol on 36.\n\n"
     "Opus is shown on the 12 markets where its queue notes recorded an estimate; no pass of its own wrote a\n"
     "machine-readable set, so it is not comparable with the rest.", size=12)

# ---------------------------------------------------------------- 5 score table
s5 = prs.slides.add_slide(BLANK)
head(s5, "Every measure", "Base rate 0.459: seventeen of thirty-seven accepted")
rows = [("forecaster", "n", "Brier", "log loss", "accuracy", "mean p", "bias")]
for f in order:
    rows.append((NAMES.get(f["name"], f["name"]), "%d" % f["n"], "%.4f" % f["brier"], "%.4f" % f["logloss"],
                 "%.2f" % f["accuracy"], "%.3f" % f["meanForecast"], "%+.3f" % (f["meanForecast"] - f["baseRate"])))
table(s5, 0.62, 2.05, 8.4, rows, widths=[2.6, 0.6, 1.0, 1.0, 1.0, 1.0, 1.0], row_h=0.38)
text(s5, 0.62, 5.4, 12.1, 1.6,
     "Bias is mean forecast minus base rate: positive means systematically too bullish. Every forecaster was\n"
     "too bullish except Jev, which was the only one to lean below the base rate — and the market was the most\n"
     "bullish of all at +0.147, which is exactly the whale flip it failed to price.", size=12)

# ---------------------------------------------------------------- 6 skill vs profit
s6 = prs.slides.add_slide(BLANK)
head(s6, "Skill and profit came apart", "Brier score against grants P&L — the best forecaster lost money")
xy = XyChartData()
for f in order:
    if f["name"] not in pnl_of:
        continue
    srs = xy.add_series(NAMES[f["name"]])
    srs.add_data_point(f["brier"], pnl_of[f["name"]])
gf = s6.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER, Inches(0.7), Inches(1.95), Inches(7.6), Inches(4.7), xy)
ch = gf.chart
style_chart(ch, legend=True)
ch.value_axis.has_major_gridlines = True
ch.category_axis.has_major_gridlines = False
ch.value_axis.axis_title.text_frame.text = "grants P&L (sUSDS)"
ch.category_axis.axis_title.text_frame.text = "Brier score (lower = better forecasts)"
for ax in (ch.value_axis, ch.category_axis):
    ax.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(11)
    ax.axis_title.text_frame.paragraphs[0].runs[0].font.name = "Segoe UI"
text(s6, 8.5, 2.0, 4.3, 4.6,
     "Jev: the best forecasts (0.030) and the only loss (−43.64).\n\n"
     "Opus: the weakest recorded forecasts and the largest profit (+364.20).\n\n"
     "Forecasting the vote was not the hard part — the ballot counts were public all round. Converting a\n"
     "forecast into money took re-reading the price, sizing against a live quote, and exiting when the\n"
     "estimate moved. Jev does none of those: one trade per market, no adds, no unwinds.\n\n"
     "That is the clearest result of the round.", size=12)

# ---------------------------------------------------------------- 7 ballots vs weight
s7 = prs.slides.add_slide(BLANK)
head(s7, "Where the market went wrong", "Ballot accept share against ZEC accept share, per proposal")
xy = XyChartData()
srs_acc = xy.add_series("accepted")
srs_rej = xy.add_series("rejected")
for pid, t in S["truth"].items():
    ballots = t["ballotsAccept"] / max(1, t["ballotsAccept"] + t["ballotsReject"])
    (srs_acc if t["outcome"] else srs_rej).add_data_point(ballots, t["share"])
gf = s7.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER, Inches(0.7), Inches(1.95), Inches(7.2), Inches(4.7), xy)
ch = gf.chart
style_chart(ch, legend=True)
ch.category_axis.axis_title.text_frame.text = "accept share of ballots"
ch.value_axis.axis_title.text_frame.text = "accept share of ZEC"
for ax in (ch.value_axis, ch.category_axis):
    ax.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(11)
    ax.axis_title.text_frame.paragraphs[0].runs[0].font.name = "Segoe UI"
flips = sum(1 for t in S["truth"].values() if (t["ballotsAccept"] > t["ballotsReject"]) != (t["outcome"] == 1))
text(s7, 8.1, 2.0, 4.7, 4.6,
     "%d proposals were decided against their ballot majority.\n\n"
     "The relationship is almost a step function: a proposal either had the large holders behind it, in which\n"
     "case it passed with 95–100%% of the weight, or it did not, in which case ballots barely mattered.\n\n"
     "CyphZec had the most accept ballots of any rejected proposal (1,494) and finished at 2.9%% of the\n"
     "weight.\n\n"
     "Pricing the ballot counts, as the pools did, was pricing the wrong electorate." % flips, size=12)

# ---------------------------------------------------------------- 8/9 per-market appendix
rows_all = sorted(S["truth"].items(), key=lambda kv: -kv[1]["share"])
per = {f["name"]: {r["ref"]: r["p"] for r in f["rows"]} for f in S["forecasters"]}
ref_for = S["refForProposal"]
for part, chunk in enumerate([rows_all[:19], rows_all[19:]]):
    sx = prs.slides.add_slide(BLANK)
    head(sx, "Every market and every forecast (%d of 2)" % (part + 1),
         "ZEC accept share, the outcome, and each forecaster's P(Yes) before the close")
    rows = [("proposal", "ZEC", "result", "Fable", "Opus", "Astra", "Sol", "Jev", "mkt")]
    for pid, t in chunk:
        ref = ref_for[str(pid)] if str(pid) in ref_for else ref_for.get(pid)
        def g(name):
            v = per.get(name, {}).get(ref)
            return "%.2f" % v if v is not None else "-"
        rows.append((t["title"].split("—")[0].strip()[:30], "%.0f%%" % (100 * t["share"]),
                     "yes" if t["outcome"] else "no", g("fable-5.1"), g("opus-5"), g("astra-gpt-6b"),
                     g("gpt-5.6-sol"), g("jev"), g("market (closing pool price)")))
    table(sx, 0.62, 1.95, 12.1, rows, widths=[3.6, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], size=10, header_size=9, row_h=0.265)

# ---------------------------------------------------------------- 10 method
s10 = prs.slides.add_slide(BLANK)
head(s10, "Method and caveats", "What is measured, and what is not")
text(s10, 0.62, 1.95, 12.1, 5.0,
     "Money. Each wallet began this round at exactly 900.00 sUSDS, measured as the last cash reading before its\n"
     "first grant trade on 16 September. P&L is cash today minus 900 minus the NU7 proceeds each wallet collected\n"
     "during the round (Opus 356.44, Sol 224.23, Fable 150.00, Astra 74.00, Jev none), so nothing from the earlier\n"
     "experiment is counted. Gas is paid in ETH and does not appear. Fable's six exits during the round are inside\n"
     "its cash figure rather than broken out.\n\n"
     "Forecasts. Each bot's last estimate recorded before the vote closed at 29 Sep 20:00 UTC — Fable from\n"
     "fleet-grants.json, Sol from fleet.json, Astra from estimates.json, Jev from its report. Anything written after\n"
     "the close is hindsight: scoring it first gave Sol a Brier of 0.0000, which is how the error was caught.\n\n"
     "Opus has no machine-readable estimate set; its 12 shown values come from the notes it wrote when queueing\n"
     "trades, taken at different dates, so its Brier is not comparable with the others and is marked as such.\n\n"
     "The market's forecast is the closing pool price with Invalid dropped, the same transformation applied to the\n"
     "bots, so all seven forecasters are scored on the same two outcomes.\n\n"
     "Still open: the Gnosis book — 34 Devcon side-event and Clément conditionals — cannot resolve until the event\n"
     "in November and the films are scored. Every bot is ahead there, between +9.59 and +27.73 sDAI.", size=12)

out = os.path.join(HERE, "..", "Grants-Q3-five-model-experiment.pptx")
prs.save(out)
print("saved " + os.path.abspath(out) + "  (%d slides)" % len(prs.slides._sldIdLst))
