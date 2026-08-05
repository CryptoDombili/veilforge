from __future__ import annotations

import hashlib
import html
import re
from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs" / "whitepaper"
WEB_DIR = ROOT / "apps" / "web" / "whitepaper"
FIGURE_DIR = SOURCE_DIR / "figures"
FONT_DIR = ROOT / "apps" / "web" / "fonts"
MINT = colors.HexColor("#42d8ad")
INK = colors.HexColor("#172236")
MUTED = colors.HexColor("#566477")
PALE = colors.HexColor("#eef5f4")
VIOLET = colors.HexColor("#786ee8")
rl_config.invariant = 1


def register_fonts() -> None:
    for name, filename in (("Manrope", "manrope-400.ttf"), ("Manrope-Semi", "manrope-600.ttf"), ("Manrope-Bold", "manrope-700.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))


def source_digest(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def inline_markup(value: str) -> str:
    value = html.escape(value, quote=False)
    value = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", value)
    value = re.sub(r"\[([^]]+)]\(([^)]+)\)", r'<link href="\2" color="#287d69">\1</link>', value)
    return value


class FigureFlowable(Flowable):
    LABELS = {
        "veilforge-architecture.svg": ["Solidity", "Analyze", "Findings", "Report + gate", "Arc proof"],
        "configure-to-export-workflow.svg": ["Configure", "Scan", "Review", "Verify", "Publish", "Export"],
        "arc-testnet-proof-lifecycle.svg": ["Report hash", "Preflight", "Approval", "Publish", "Reconcile", "No duplicate"],
        "open-core-sustainability-loop.svg": ["Local core", "Adoption", "Demand", "Managed", "Reinvest"],
        "mainnet-staged-rollout.svg": ["Resolve", "Review", "Rehearse", "Read only", "Limited publish"],
    }

    def __init__(self, filename: str, caption: str):
        super().__init__()
        self.filename = filename
        self.caption = caption
        self.width = 174 * mm
        self.height = 56 * mm

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(colors.HexColor("#0b1422")); c.roundRect(0, 0, self.width, self.height, 8, fill=1, stroke=0)
        c.setFillColor(MINT); c.setFont("Manrope-Bold", 7.5); c.drawString(9 * mm, self.height - 11 * mm, self.filename.replace(".svg", "").replace("-", " ").upper())
        labels = self.LABELS.get(self.filename, ["Evidence", "Verify", "Publish"])
        gap = (self.width - 18 * mm) / len(labels)
        y = 25 * mm
        for index, label in enumerate(labels):
            x = 9 * mm + index * gap
            box_width = gap - 4 * mm
            c.setStrokeColor(colors.HexColor("#426079")); c.setFillColor(colors.HexColor("#112238")); c.roundRect(x, y - 8 * mm, box_width, 16 * mm, 4, fill=1, stroke=1)
            c.setFillColor(colors.HexColor("#dbe6ef")); c.setFont("Manrope-Semi", 6.5); c.drawCentredString(x + box_width / 2, y - 2, label)
            if index < len(labels) - 1:
                c.setStrokeColor(MINT); c.line(x + box_width, y, x + gap, y)
        c.setFillColor(colors.HexColor("#91a0b2")); c.setFont("Manrope", 6.5); c.drawString(9 * mm, 7 * mm, self.caption[:150])
        c.restoreState()


class WhitepaperDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, title: str, subject: str, digest: str):
        super().__init__(filename, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=18 * mm, title=title, author="VeilForge", subject=subject, creator="VeilForge deterministic document builder", keywords="VeilForge, Arc, Solidity, privacy readiness, verified evidence")
        self.document_title = title
        self.digest = digest
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates(PageTemplate(id="content", frames=[frame], onPage=self._page))
        self._bookmark_index = 0

    def beforeDocument(self):
        self._bookmark_index = 0

    def _page(self, canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#dce6e4")); canvas.line(self.leftMargin, A4[1] - 13 * mm, A4[0] - self.rightMargin, A4[1] - 13 * mm)
        canvas.setFont("Manrope-Semi", 7.5); canvas.setFillColor(MUTED); canvas.drawString(self.leftMargin, A4[1] - 9.5 * mm, "VEILFORGE V4 / GRANT CANDIDATE")
        canvas.drawRightString(A4[0] - self.rightMargin, 9 * mm, f"{doc.page}")
        canvas.setFont("Manrope", 6.5); canvas.drawString(self.leftMargin, 9 * mm, self.digest)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        level = getattr(flowable, "outline_level", None)
        if level is None:
            return
        self._bookmark_index += 1
        key = f"section-{self._bookmark_index}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(flowable.getPlainText(), key, level=level, closed=False)
        self.notify("TOCEntry", (level, flowable.getPlainText(), self.page, key))


def styles():
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=sample["Title"], fontName="Manrope-Bold", fontSize=30, leading=34, textColor=INK, alignment=TA_LEFT, spaceAfter=8 * mm),
        "subtitle": ParagraphStyle("subtitle", parent=sample["Normal"], fontName="Manrope-Semi", fontSize=13, leading=19, textColor=MUTED, spaceAfter=6 * mm),
        "h1": ParagraphStyle("h1", parent=sample["Heading1"], fontName="Manrope-Bold", fontSize=18, leading=23, textColor=INK, spaceBefore=7 * mm, spaceAfter=3 * mm, keepWithNext=True),
        "h2": ParagraphStyle("h2", parent=sample["Heading2"], fontName="Manrope-Bold", fontSize=13, leading=18, textColor=INK, spaceBefore=5 * mm, spaceAfter=2 * mm, keepWithNext=True),
        "body": ParagraphStyle("body", parent=sample["BodyText"], fontName="Manrope", fontSize=9, leading=14.2, textColor=INK, spaceAfter=2.6 * mm),
        "bullet": ParagraphStyle("bullet", parent=sample["BodyText"], fontName="Manrope", fontSize=8.8, leading=13.6, textColor=INK, leftIndent=5 * mm, firstLineIndent=-3 * mm, bulletIndent=0, spaceAfter=1.5 * mm),
        "caption": ParagraphStyle("caption", parent=sample["BodyText"], fontName="Manrope", fontSize=7.5, leading=11, textColor=MUTED, spaceAfter=4 * mm),
        "toc": ParagraphStyle("toc", parent=sample["Heading1"], fontName="Manrope-Bold", fontSize=22, textColor=INK, spaceAfter=7 * mm),
    }


def cover_story(title: str, subtitle: str, digest: str, brief: bool):
    s = styles()
    return [
        Spacer(1, 22 * mm),
        Paragraph("VEILFORGE V4", ParagraphStyle("kicker", parent=s["body"], fontName="Manrope-Bold", fontSize=10, textColor=MINT, leading=14, spaceAfter=12 * mm)),
        Paragraph(title, s["title"]),
        Paragraph(subtitle, s["subtitle"]),
        Spacer(1, 12 * mm),
        Table([["DOCUMENT", "Executive brief" if brief else "Technical whitepaper"], ["STATUS", "Grant Candidate / evidence package"], ["DATE", "August 2026"], ["SOURCE DIGEST", digest]], colWidths=[36 * mm, 128 * mm], style=TableStyle([("BACKGROUND", (0, 0), (0, -1), PALE), ("TEXTCOLOR", (0, 0), (0, -1), INK), ("FONTNAME", (0, 0), (0, -1), "Manrope-Bold"), ("FONTNAME", (1, 0), (1, -1), "Manrope"), ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("LEADING", (0, 0), (-1, -1), 11), ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#ccd8d5")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("WORDWRAP", (0, 0), (-1, -1), "CJK"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)])),
        Spacer(1, 32 * mm),
        Paragraph("Evidence-first release engineering for Solidity teams building on Arc.", ParagraphStyle("covercallout", parent=s["subtitle"], fontSize=15, leading=22, textColor=VIOLET)),
        PageBreak(),
    ]


def markdown_story(markdown: str, brief: bool):
    s = styles()
    lines = markdown.splitlines()
    title = next(line[2:] for line in lines if line.startswith("# "))
    subtitle = next((line[3:] for line in lines if line.startswith("## ")), "Deterministic privacy-readiness analysis and verifiable evidence for Solidity on Arc")
    digest = source_digest(markdown)
    story = cover_story(title, subtitle, digest, brief)
    if not brief:
        story.extend([Paragraph("Contents", s["toc"]), TableOfContents(), PageBreak()])
    paragraph = []
    table_rows = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(part.strip() for part in paragraph)), s["body"]))
            paragraph = []

    def flush_table():
        nonlocal table_rows
        if table_rows:
            rows = [[Paragraph(inline_markup(cell.strip()), s["caption"]) for cell in row] for row in table_rows if not all(re.fullmatch(r"[-: ]+", cell.strip()) for cell in row)]
            if rows:
                story.append(Table(rows, repeatRows=1, colWidths=[174 * mm / len(rows[0])] * len(rows[0]), style=TableStyle([("BACKGROUND", (0, 0), (-1, 0), PALE), ("FONTNAME", (0, 0), (-1, 0), "Manrope-Bold"), ("GRID", (0, 0), (-1, -1), .35, colors.HexColor("#cad6d3")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)])))
                story.append(Spacer(1, 3 * mm))
            table_rows = []

    for line in lines:
        image_match = re.fullmatch(r"!\[([^]]+)]\(figures/([^)]+)\)", line.strip())
        if image_match:
            flush_paragraph(); flush_table(); story.append(KeepTogether([FigureFlowable(image_match.group(2), image_match.group(1)), Spacer(1, 2 * mm)])); continue
        if line.startswith("# ") or line.startswith("## ") or line.startswith("### "):
            flush_paragraph(); flush_table()
            if line.startswith("# "):
                continue
            level = 0 if line.startswith("## ") else 1
            heading = Paragraph(inline_markup(line[3:] if level == 0 else line[4:]), s["h1" if level == 0 else "h2"])
            heading.outline_level = level
            story.append(heading)
        elif line.startswith("|") and line.rstrip().endswith("|"):
            flush_paragraph(); table_rows.append([cell for cell in line.strip().strip("|").split("|")])
        elif line.startswith(('- ', '* ')):
            flush_paragraph(); flush_table(); story.append(Paragraph("- " + inline_markup(line[2:]), s["bullet"]))
        elif re.match(r"^\d+\. ", line):
            flush_paragraph(); flush_table(); story.append(Paragraph(inline_markup(line), s["bullet"]))
        elif not line.strip():
            flush_paragraph(); flush_table()
        else:
            paragraph.append(line)
    flush_paragraph(); flush_table()
    return story, title, subtitle, digest


def render_pdf(markdown: str, target: Path, brief: bool) -> str:
    story, title, subtitle, digest = markdown_story(markdown, brief)
    doc = WhitepaperDocTemplate(str(target), title, subtitle, digest)
    doc.multiBuild(story)
    return digest


def markdown_html(markdown: str, title: str, digest: str, brief: bool) -> str:
    blocks = []
    in_list = False
    in_table = False
    table_rows = []
    paragraph = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            blocks.append(f"<p>{inline_markup(' '.join(part.strip() for part in paragraph))}</p>")
            paragraph = []

    def flush_list():
        nonlocal in_list
        if in_list: blocks.append("</ul>"); in_list = False

    def flush_table():
        nonlocal in_table, table_rows
        if in_table:
            rows = [row for row in table_rows if not all(re.fullmatch(r"[-: ]+", cell.strip()) for cell in row)]
            if rows:
                blocks.append('<div class="table-wrap"><table><thead><tr>' + ''.join(f"<th>{inline_markup(cell.strip())}</th>" for cell in rows[0]) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f"<td>{inline_markup(cell.strip())}</td>" for cell in row) + '</tr>' for row in rows[1:]) + '</tbody></table></div>')
            in_table = False; table_rows = []

    for line in markdown.splitlines():
        image_match = re.fullmatch(r"!\[([^]]+)]\(figures/([^)]+)\)", line.strip())
        if image_match:
            flush_paragraph(); flush_list(); flush_table(); blocks.append(f'<figure><img src="./figures/{html.escape(image_match.group(2))}" alt="{html.escape(image_match.group(1))}" loading="lazy" /></figure>'); continue
        if line.startswith("# ") or line.startswith("## ") or line.startswith("### "):
            flush_paragraph(); flush_list(); flush_table(); level = 1 if line.startswith("# ") else 2 if line.startswith("## ") else 3; value = line[level + 1:]; slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-"); blocks.append(f'<h{level} id="{slug}">{inline_markup(value)}</h{level}>')
        elif line.startswith("|") and line.rstrip().endswith("|"):
            flush_paragraph(); flush_list(); in_table = True; table_rows.append(line.strip().strip("|").split("|"))
        elif line.startswith(('- ', '* ')) or re.match(r"^\d+\. ", line):
            flush_paragraph(); flush_table()
            if not in_list: blocks.append("<ul>"); in_list = True
            value = line[2:] if line[1:2] == ' ' else re.sub(r"^\d+\. ", "", line)
            blocks.append(f"<li>{inline_markup(value)}</li>")
        elif not line.strip():
            flush_paragraph(); flush_list(); flush_table()
        else:
            paragraph.append(line)
    flush_paragraph(); flush_list(); flush_table()
    pdf_name = "VeilForge_V4_Executive_Brief.pdf" if brief else "VeilForge_V4_Whitepaper.pdf"
    switch_href = "./" if brief else "./executive-brief.html"
    switch_label = "Full Whitepaper" if brief else "Executive Brief"
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="VeilForge V4 {'executive brief' if brief else 'technical whitepaper'}"><title>{html.escape(title)} - VeilForge</title><link rel="icon" href="../favicon.png"><link rel="stylesheet" href="./reader.css"></head><body><a class="skip" href="#document">Skip to document</a><nav aria-label="Whitepaper navigation"><a href="../">VeilForge</a><div><a href="{switch_href}">{switch_label}</a><a href="./{pdf_name}" download>Download PDF</a><a href="../app/index.html#scanner">Launch V4 Scanner</a></div></nav><main id="document"><header class="document-hero"><p>VEILFORGE V4 / GRANT CANDIDATE</p><h1>{html.escape(title)}</h1><span>{'Concise evidence review' if brief else 'Deterministic privacy-readiness analysis and verifiable evidence for Solidity on Arc'}</span><small>{digest}</small></header><article>{''.join(blocks)}</article></main><footer><span>Evidence-first release engineering for Solidity on Arc.</span><a href="https://github.com/CryptoDombili/veilforge">Open source</a></footer></body></html>'''


def main() -> None:
    register_fonts(); WEB_DIR.mkdir(parents=True, exist_ok=True); (WEB_DIR / "figures").mkdir(exist_ok=True)
    documents = [
        ("veilforge-v4-whitepaper.md", "index.html", "VeilForge_V4_Whitepaper.pdf", False),
        ("veilforge-v4-whitepaper-executive-brief.md", "executive-brief.html", "VeilForge_V4_Executive_Brief.pdf", True),
    ]
    for source_name, html_name, pdf_name, brief in documents:
        markdown = (SOURCE_DIR / source_name).read_text(encoding="utf-8")
        title = next(line[2:] for line in markdown.splitlines() if line.startswith("# "))
        digest = render_pdf(markdown, WEB_DIR / pdf_name, brief)
        (WEB_DIR / html_name).write_text(markdown_html(markdown, title, digest, brief), encoding="utf-8", newline="\n")
    reader_css = '''@font-face{font-family:Manrope;src:url(../fonts/manrope-400.ttf)}@font-face{font-family:Manrope;src:url(../fonts/manrope-700.ttf);font-weight:700}:root{font-family:Manrope,system-ui,sans-serif;color:#dbe3ed;background:#080c13}*{box-sizing:border-box}body{margin:0;line-height:1.72}.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:12px;z-index:3;background:#75f7c8;color:#07110e;padding:10px}nav,main,footer{width:min(920px,calc(100% - 36px));margin:auto}nav{min-height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #233043}nav>div{display:flex;gap:18px}nav a,article a,footer a{color:#75f7c8}main{padding:72px 0}.document-hero{padding:50px 0 74px;border-bottom:1px solid #233043}.document-hero>p{color:#75f7c8;font-size:11px;font-weight:700;letter-spacing:.16em}.document-hero h1{max-width:780px;font-size:clamp(46px,8vw,78px);line-height:1;letter-spacing:-.055em}.document-hero span{display:block;max-width:670px;color:#95a2b3;font-size:18px}.document-hero small{display:block;margin-top:25px;color:#647286;overflow-wrap:anywhere}article{padding-top:64px}article h1{display:none}article h2{margin:72px 0 18px;font-size:34px;line-height:1.15}article h3{margin:40px 0 12px;font-size:22px}article p,article li{color:#abb6c5}article code{overflow-wrap:anywhere;color:#bdfbe6}figure{margin:46px 0}figure img{display:block;width:100%;border:1px solid #26354a;border-radius:18px;background:#0a101a}.table-wrap{margin:30px 0;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:12px;border:1px solid #2a384a;text-align:left;vertical-align:top}th{color:#bdfbe6;background:#101923}footer{min-height:110px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #233043;color:#718096}@media(max-width:650px){nav{align-items:flex-start;gap:16px;padding:18px 0}nav>div{flex-direction:column;gap:7px;text-align:right}.document-hero{padding-top:30px}.document-hero h1{font-size:44px}article h2{font-size:28px}main{padding-top:38px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'''
    (WEB_DIR / "reader.css").write_text(reader_css + "\n", encoding="utf-8", newline="\n")
    for figure in sorted(FIGURE_DIR.glob("*.svg")):
        (WEB_DIR / "figures" / figure.name).write_bytes(figure.read_bytes())
    print("Generated VeilForge whitepaper HTML, PDF, CSS, and figure assets.")


if __name__ == "__main__":
    main()
