"""Generate the Bhumi ward-level climate action report as a PDF (bytes).

Used by POST /report. Pure reportlab — no external services — so it works offline.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

import config
import tools as toolkit

_DARK = colors.HexColor("#0b3d2e")
_ACCENT = colors.HexColor("#1a9641")
_GREY = colors.HexColor("#555555")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("BhumiTitle", parent=ss["Title"], textColor=_DARK, fontSize=22))
    ss.add(ParagraphStyle("BhumiH2", parent=ss["Heading2"], textColor=_ACCENT, fontSize=13))
    ss.add(ParagraphStyle("BhumiBody", parent=ss["BodyText"], fontSize=10, leading=14))
    ss.add(ParagraphStyle("BhumiSmall", parent=ss["BodyText"], fontSize=8, textColor=_GREY))
    return ss


def _risk_color(score: int):
    if score >= 85:
        return colors.HexColor("#d7191c")
    if score >= 70:
        return colors.HexColor("#fdae61")
    if score >= 55:
        return colors.HexColor("#ffffbf")
    return colors.HexColor("#a6d96a")


def build_report(
    year: int = 2026,
    wards: list[str] | None = None,
    layer: str = "heat",
    lang: str = "en-IN",
) -> bytes:
    """Return a PDF report (bytes) for the given wards + focus layer."""
    ss = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=16 * mm,
        title="Bhumi Climate Action Report",
    )
    story = []

    story.append(Paragraph("Bhumi — Climate Action Report", ss["BhumiTitle"]))
    story.append(Paragraph(
        f"Hyderabad · {config.LAYERS.get(layer, {}).get('label', layer)} focus · {year}",
        ss["BhumiH2"]))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph(f"Generated {now} · Agentic Climate Digital Twin", ss["BhumiSmall"]))
    story.append(Spacer(1, 8 * mm))

    # ── City scorecards ───────────────────────────────────────
    story.append(Paragraph("City-wide risk summary", ss["BhumiH2"]))
    cards = toolkit.get_scorecards(year).get("cards", [])
    if cards:
        head = ["Risk layer", "Score / 100", "Level", "Δ since 2016"]
        rows = [head] + [
            [c["label"], str(c["score"]), c["level"],
             ("+" if c["delta_since_2016"] >= 0 else "") + str(c["delta_since_2016"])]
            for c in cards
        ]
        t = Table(rows, colWidths=[55 * mm, 30 * mm, 35 * mm, 35 * mm])
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), _DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f7f4")]),
        ]
        for i, c in enumerate(cards, start=1):
            style.append(("TEXTCOLOR", (1, i), (1, i), _risk_color(c["score"])))
        t.setStyle(TableStyle(style))
        story.append(t)
    story.append(Spacer(1, 8 * mm))

    # ── Priority wards for the focus layer ────────────────────
    label = config.LAYERS.get(layer, {}).get("label", layer)
    story.append(Paragraph(f"Priority wards — {label}", ss["BhumiH2"]))
    ranked = toolkit.get_ward_stats(layer, year)
    if wards:
        ranked = [r for r in ranked if r["name"] in wards] or ranked
    ranked = ranked[:8]
    rows = [["#", "Ward", f"{label} score", "Level"]]
    for i, r in enumerate(ranked, start=1):
        lvl = next(l for thr, l in [(85, "Very High"), (70, "High"), (55, "Moderate"), (0, "Low")]
                   if r["score"] >= thr)
        rows.append([str(i), r["name"], str(r["score"]), lvl])
    t = Table(rows, colWidths=[12 * mm, 60 * mm, 40 * mm, 40 * mm])
    tstyle = [
        ("BACKGROUND", (0, 0), (-1, 0), _ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
    ]
    for i, r in enumerate(ranked, start=1):
        tstyle.append(("TEXTCOLOR", (2, i), (2, i), _risk_color(r["score"])))
    t.setStyle(TableStyle(tstyle))
    story.append(t)
    story.append(Spacer(1, 8 * mm))

    # ── Recommended actions ───────────────────────────────────
    story.append(Paragraph("Recommended actions", ss["BhumiH2"]))
    rec = toolkit.recommend_actions(layer, [r["name"] for r in ranked[:3]])
    if rec.get("cause"):
        story.append(Paragraph(f"<b>Primary driver:</b> {rec['cause']}.", ss["BhumiBody"]))
        story.append(Spacer(1, 2 * mm))
    for i, action in enumerate(rec.get("actions", []), start=1):
        story.append(Paragraph(f"{i}. {action}", ss["BhumiBody"]))
        story.append(Spacer(1, 1.5 * mm))

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "Generated by Bhumi · powered by Sarvam AI + Google Earth Engine · "
        "for a safer, greener Hyderabad.", ss["BhumiSmall"]))

    doc.build(story)
    return buf.getvalue()
