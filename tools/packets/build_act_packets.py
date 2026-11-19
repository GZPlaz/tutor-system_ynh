"""
Builds the two free study packets bundled with the app:

    app/server/seed/packets/act-math-practice-packet.pdf     (7 pages)
    app/server/seed/packets/act-english-practice-packet.pdf  (7 pages)

The server copies them into UPLOAD_DIR on first start (src/modules/packets/seed.ts).
Re-run after editing the content below:

    pip install reportlab pypdf
    python3 tools/packets/build_act_packets.py

Each page is laid out explicitly (one PageBreak per page) and the script fails
if a packet does not come out at exactly 7 pages.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app" / "server" / "seed" / "packets"
PAGES = 7

# ---------------------------------------------------------------------------
# Look
# ---------------------------------------------------------------------------

FONT_DIR = Path(os.environ.get("PACKET_FONT_DIR", "/usr/share/fonts/truetype/liberation"))
pdfmetrics.registerFont(TTFont("Body", str(FONT_DIR / "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONT_DIR / "LiberationSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONT_DIR / "LiberationSans-Italic.ttf")))
pdfmetrics.registerFont(TTFont("Body-BoldItalic", str(FONT_DIR / "LiberationSans-BoldItalic.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-BoldItalic")

BRAND = colors.HexColor("#0e6e6a")
BRAND_SOFT = colors.HexColor("#e3eeec")
ACCENT_SOFT = colors.HexColor("#fff2c7")
INK = colors.HexColor("#15242b")
MUTED = colors.HexColor("#5a6a71")
LINE = colors.HexColor("#c3ccc7")

S = {
    "body": ParagraphStyle("body", fontName="Body", fontSize=10, leading=13.5, textColor=INK, spaceAfter=5),
    "small": ParagraphStyle("small", fontName="Body", fontSize=8.8, leading=11.4, textColor=INK, spaceAfter=3),
    "tiny": ParagraphStyle("tiny", fontName="Body", fontSize=8.3, leading=10.6, textColor=INK, spaceAfter=2),
    "muted": ParagraphStyle("muted", fontName="Body", fontSize=9, leading=12, textColor=MUTED, spaceAfter=4),
    "h1": ParagraphStyle("h1", fontName="Body-Bold", fontSize=26, leading=30, textColor=INK, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Body-Bold", fontSize=15, leading=19, textColor=BRAND, spaceBefore=4, spaceAfter=6),
    "h3": ParagraphStyle("h3", fontName="Body-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=6, spaceAfter=3),
    "eyebrow": ParagraphStyle("eyebrow", fontName="Body-Bold", fontSize=9, leading=12, textColor=BRAND, spaceAfter=4),
    "q": ParagraphStyle("q", fontName="Body", fontSize=10, leading=13.2, textColor=INK, spaceAfter=2, leftIndent=20, firstLineIndent=-20),
    "choice": ParagraphStyle("choice", fontName="Body", fontSize=9.6, leading=12.4, textColor=INK),
    "passage": ParagraphStyle("passage", fontName="Body", fontSize=9.4, leading=13.6, textColor=INK, spaceAfter=6, firstLineIndent=12),
    "eq": ParagraphStyle("eq", fontName="Body", fontSize=8.6, leading=11, textColor=INK, spaceAfter=0, leftIndent=17, firstLineIndent=-17),
    "eqc": ParagraphStyle("eqc", fontName="Body", fontSize=8.3, leading=10.2, textColor=INK, leftIndent=17),
    "center": ParagraphStyle("center", fontName="Body", fontSize=10, leading=13, textColor=INK, alignment=TA_CENTER),
}


def P(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, S[style])


def boxed(flowables, bg=BRAND_SOFT, pad=10, width=7.0 * inch):
    t = Table([[flowables]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), pad),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), pad - 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad - 2),
    ]))
    return t


def grid(rows, widths, header=True, font_size=9):
    t = Table(rows, colWidths=widths)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Body"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), BRAND), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Body-Bold")]
    t.setStyle(TableStyle(style))
    return t


def letters(n: int) -> list[str]:
    """ACT style: odd-numbered questions use A-D, even-numbered use F-J."""
    return ["A", "B", "C", "D"] if n % 2 else ["F", "G", "H", "J"]


def make_doc(path: Path, title: str, subject: str):
    def frame(canvas, doc):
        canvas.saveState()
        w, h = letter
        canvas.setFillColor(BRAND)
        canvas.rect(0, h - 0.32 * inch, w, 0.32 * inch, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Body-Bold", 8.5)
        canvas.drawString(0.75 * inch, h - 0.21 * inch, "MINDACCEL TUTORING  ·  FREE STUDY PACKET")
        canvas.drawRightString(w - 0.75 * inch, h - 0.21 * inch, subject.upper())
        canvas.setFillColor(MUTED)
        canvas.setFont("Body", 7.5)
        canvas.drawString(0.75 * inch, 0.45 * inch, "ACT® is a registered trademark of ACT Education Corp., which does not sponsor or endorse this packet.")
        canvas.drawRightString(w - 0.75 * inch, 0.45 * inch, f"{title}  ·  Page {doc.page} of {PAGES}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(path), pagesize=letter, title=title, author="MindAccel Tutoring", subject=subject,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.62 * inch, bottomMargin=0.7 * inch,
    )
    return doc, frame


def build(path: Path, title: str, subject: str, pages: list[list]):
    assert len(pages) == PAGES, f"{title}: {len(pages)} page blocks"
    doc, frame = make_doc(path, title, subject)
    story = []
    for i, page in enumerate(pages):
        story += page
        if i < len(pages) - 1:
            story.append(PageBreak())
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    n = len(PdfReader(str(path)).pages)
    if n != PAGES:
        sys.exit(f"{path.name} has {n} pages; expected {PAGES}. Something overflowed a page.")
    print(f"wrote {path.relative_to(ROOT)} ({n} pages, {path.stat().st_size // 1024} KB)")


def cover(subject: str, title: str, blurb: str, facts: list[tuple[str, str]], contents: list[tuple[str, str]], steps: list[str], tips_title: str, tips: list[str]):
    facts_t = Table([[P(f"<b>{v}</b>", "center") for _, v in facts], [P(k, "muted") for k, _ in facts]], colWidths=[1.75 * inch] * len(facts))
    facts_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_SOFT),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    for row in facts_t._cellvalues[1]:
        row.style = ParagraphStyle("fc", parent=S["muted"], alignment=TA_CENTER)
    contents_t = grid([["Page", "What's on it"]] + [[a, P(b, "small")] for a, b in contents], [0.8 * inch, 6.2 * inch])
    return [
        Spacer(1, 6),
        P(subject.upper() + "  ·  PRACTICE PACKET 1", "eyebrow"),
        P(title, "h1"),
        P(blurb, "body"),
        Spacer(1, 6),
        facts_t,
        Spacer(1, 10),
        P("What's inside", "h3"),
        contents_t,
        Spacer(1, 6),
        P("How to use this packet", "h3"),
        *[P(f"<b>{i}.</b>  {s}", "q") for i, s in enumerate(steps, 1)],
        Spacer(1, 6),
        boxed([P(tips_title, "h3")] + [P(f"•  {t}", "small") for t in tips], bg=ACCENT_SOFT),
        Spacer(1, 8),
        P("Name: ______________________________     Date: ______________     Start time: ________     End time: ________", "small"),
    ]


def answer_grid(answers: dict[int, str]):
    nums = sorted(answers)
    half = (len(nums) + 2) // 3
    cols = [nums[i:i + half] for i in range(0, len(nums), half)]
    rows = [["#", "Answer", "Mine", "#", "Answer", "Mine", "#", "Answer", "Mine"]]
    for r in range(half):
        row = []
        for c in cols:
            if r < len(c):
                row += [str(c[r]), answers[c[r]], ""]
            else:
                row += ["", "", ""]
        rows.append(row)
    return grid(rows, [0.45 * inch, 0.75 * inch, 0.75 * inch] * 3, font_size=8.6)


def explanations(items: list[tuple[int, str, str]], style="eq"):
    """items: (number, correct letter, explanation)"""
    return [P(f"<b>{n}.  {letter}</b>  {text}", style) for n, letter, text in items]


# ---------------------------------------------------------------------------
# ACT Math
# ---------------------------------------------------------------------------

MATH_Q = [
    # (question, [choices], answer letter, explanation, topic)
    ("If 3<i>x</i> − 7 = 11, what is the value of <i>x</i>?", ["3", "4", "6", "9"], "C",
     "Add 7 to both sides: 3<i>x</i> = 18. Divide by 3: <i>x</i> = 6.", "Linear equations"),
    ("Which expression is equivalent to (2<i>x</i><super>3</super>)(5<i>x</i><super>4</super>)?", ["7<i>x</i><super>7</super>", "10<i>x</i><super>7</super>", "10<i>x</i><super>12</super>", "7<i>x</i><super>12</super>"], "G",
     "Multiply the coefficients (2 · 5 = 10) and add the exponents when multiplying like bases (3 + 4 = 7): 10<i>x</i><super>7</super>.", "Exponents"),
    ("A $40.00 shirt is on sale for 25% off. Sales tax of 8% is then charged on the sale price. What is the total cost?", ["$30.00", "$32.40", "$33.20", "$43.20"], "B",
     "Sale price: 40 × 0.75 = $30.00. With tax: 30 × 1.08 = $32.40. Apply the discount first, then tax the discounted price.", "Percents"),
    ("What is the slope of the line through the points (−2, 5) and (4, −7)?", ["−2", "−1/2", "1/2", "2"], "F",
     "Slope = (−7 − 5) ÷ (4 − (−2)) = −12 ÷ 6 = −2.", "Lines"),
    ("If <i>f</i>(<i>x</i>) = 2<i>x</i><super>2</super> − 3<i>x</i> + 1, what is <i>f</i>(−2)?", ["15", "3", "11", "21"], "A",
     "2(−2)<super>2</super> − 3(−2) + 1 = 2(4) + 6 + 1 = 15. Watch the signs: −3 times −2 is +6.", "Functions"),
    ("What is the sum of the solutions of <i>x</i><super>2</super> − 5<i>x</i> − 14 = 0?", ["5", "−5", "9", "14"], "F",
     "Factor: (<i>x</i> − 7)(<i>x</i> + 2) = 0, so <i>x</i> = 7 or <i>x</i> = −2. The sum is 5. Shortcut: for <i>x</i><super>2</super> + <i>bx</i> + <i>c</i>, the solutions add up to −<i>b</i>.", "Quadratics"),
    ("The mean of five numbers is 18. Four of the numbers are 12, 15, 20 and 25. What is the fifth number?", ["16", "18", "20", "22"], "B",
     "The five numbers total 5 × 18 = 90. The four known numbers total 72, so the fifth is 90 − 72 = 18.", "Statistics"),
    ("A rectangle has a perimeter of 46 cm and a length of 15 cm. What is its area, in square centimeters?", ["31", "96", "120", "345"], "H",
     "2(15) + 2<i>w</i> = 46, so 2<i>w</i> = 16 and <i>w</i> = 8. Area = 15 × 8 = 120.", "Geometry"),
    ("A right triangle has legs of length 9 and 12. What is the length of its hypotenuse?", ["15", "17", "21", "225"], "A",
     "9<super>2</super> + 12<super>2</super> = 81 + 144 = 225, and √225 = 15. (It is a 3-4-5 triangle scaled by 3.) Choice D forgets the square root.", "Geometry"),
    ("Which expression is equivalent to 3(2<i>x</i> − 4) − 2(<i>x</i> − 5)?", ["4<i>x</i> − 2", "4<i>x</i> − 22", "4<i>x</i> + 2", "8<i>x</i> − 2"], "F",
     "6<i>x</i> − 12 − 2<i>x</i> + 10 = 4<i>x</i> − 2. Distributing −2 makes −5 become +10.", "Expressions"),
    ("If <i>x</i> + <i>y</i> = 10 and <i>x</i> − <i>y</i> = 4, what is the value of <i>xy</i>?", ["21", "24", "28", "40"], "A",
     "Add the equations: 2<i>x</i> = 14, so <i>x</i> = 7 and <i>y</i> = 3. Then <i>xy</i> = 21.", "Systems"),
    ("A circle has an area of 49π square inches. What is its circumference, in inches?", ["7π", "14π", "24.5π", "49π"], "G",
     "π<i>r</i><super>2</super> = 49π gives <i>r</i> = 7. Circumference = 2π<i>r</i> = 14π.", "Circles"),
    ("A bag holds 4 red, 6 blue and 5 green marbles. One marble is drawn at random. What is the probability it is NOT blue?", ["2/5", "1/3", "4/15", "3/5"], "D",
     "There are 15 marbles and 9 are not blue: 9/15 = 3/5. Choice A is the probability that it IS blue.", "Probability"),
    ("Which describes every solution of |2<i>x</i> − 3| &lt; 7?", ["<i>x</i> &lt; 5", "−5 &lt; <i>x</i> &lt; 2", "<i>x</i> &lt; −2 or <i>x</i> &gt; 5", "−2 &lt; <i>x</i> &lt; 5"], "J",
     "|2<i>x</i> − 3| &lt; 7 means −7 &lt; 2<i>x</i> − 3 &lt; 7. Add 3: −4 &lt; 2<i>x</i> &lt; 10. Divide by 2: −2 &lt; <i>x</i> &lt; 5. \"Less than\" absolute value gives a single interval.", "Inequalities"),
    ("A car travels 180 miles on 6 gallons of gas. At the same rate, how many gallons does it need for 450 miles?", ["12", "15", "18", "25"], "B",
     "180 ÷ 6 = 30 miles per gallon, and 450 ÷ 30 = 15 gallons.", "Rates"),
    ("In a right triangle, angle θ is acute and sin θ = 3/5. What is tan θ?", ["3/4", "4/5", "4/3", "5/3"], "F",
     "sin = opposite/hypotenuse, so opposite = 3 and hypotenuse = 5. The adjacent side is 4 (3-4-5). tan = opposite/adjacent = 3/4.", "Trigonometry"),
    ("What is the vertex of the parabola <i>y</i> = (<i>x</i> − 3)<super>2</super> + 4?", ["(−3, 4)", "(3, −4)", "(3, 4)", "(4, 3)"], "C",
     "In vertex form <i>y</i> = (<i>x</i> − <i>h</i>)<super>2</super> + <i>k</i>, the vertex is (<i>h</i>, <i>k</i>) = (3, 4). The sign inside the parentheses flips.", "Quadratics"),
    ("What is the value of log<sub>2</sub> 32?", ["4", "6", "16", "5"], "J",
     "log<sub>2</sub> 32 asks \"2 to what power is 32?\" Since 2<super>5</super> = 32, the answer is 5.", "Logarithms"),
    ("The first three terms of an arithmetic sequence are 7, 11 and 15. What is the 20th term?", ["76", "79", "87", "83"], "D",
     "The common difference is 4. The <i>n</i>th term is 7 + (<i>n</i> − 1)·4, so the 20th term is 7 + 19·4 = 83.", "Sequences"),
    ("Which is equivalent to (3 + 2<i>i</i>)(1 − <i>i</i>), where <i>i</i> = √−1?", ["1 − <i>i</i>", "5 + <i>i</i>", "5 − <i>i</i>", "3 − 2<i>i</i>"], "H",
     "FOIL: 3 − 3<i>i</i> + 2<i>i</i> − 2<i>i</i><super>2</super>. Since <i>i</i><super>2</super> = −1, −2<i>i</i><super>2</super> = +2. Total: 5 − <i>i</i>.", "Complex numbers"),
    ("What is the midpoint of the segment joining (−3, 8) and (7, −2)?", ["(2, 3)", "(5, 5)", "(4, 6)", "(−5, 5)"], "A",
     "Average the coordinates: ((−3 + 7)/2, (8 + (−2))/2) = (2, 3).", "Coordinate geometry"),
    ("A town's population is 2,000 and doubles every 5 years. What will it be after 15 years?", ["6,000", "8,000", "12,000", "16,000"], "J",
     "15 years is three doubling periods: 2,000 × 2 × 2 × 2 = 16,000. Choice F multiplies by 3 instead of doubling three times.", "Exponential growth"),
    ("Which describes every solution of 5 − 2<i>x</i> ≥ 11?", ["<i>x</i> ≥ −3", "<i>x</i> ≤ −3", "<i>x</i> ≥ 3", "<i>x</i> ≤ 8"], "B",
     "Subtract 5: −2<i>x</i> ≥ 6. Divide by −2 and FLIP the sign: <i>x</i> ≤ −3.", "Inequalities"),
    ("The angles of a triangle are in the ratio 2 : 3 : 4. What is the measure of the largest angle?", ["40°", "60°", "80°", "90°"], "H",
     "2<i>k</i> + 3<i>k</i> + 4<i>k</i> = 180°, so 9<i>k</i> = 180° and <i>k</i> = 20°. The largest angle is 4(20°) = 80°.", "Geometry"),
    ("Which line passes through (0, 4) and is perpendicular to <i>y</i> = (2/3)<i>x</i> + 1?", ["<i>y</i> = (2/3)<i>x</i> + 4", "<i>y</i> = −(2/3)<i>x</i> + 4", "<i>y</i> = (3/2)<i>x</i> + 4", "<i>y</i> = −(3/2)<i>x</i> + 4"], "D",
     "Perpendicular slopes are negative reciprocals: the opposite of 3/2 is −3/2. The <i>y</i>-intercept is 4.", "Lines"),
    ("A cylinder has a radius of 3 and a height of 10. What is its volume?", ["30π", "60π", "90π", "300π"], "H",
     "<i>V</i> = π<i>r</i><super>2</super><i>h</i> = π(9)(10) = 90π. Choice G is the lateral surface area, 2π<i>rh</i>.", "Solids"),
    ("What is the median of the data set 3, 9, 4, 12, 7, 10?", ["7", "7.5", "9", "8"], "D",
     "Sort first: 3, 4, 7, 9, 10, 12. With an even count, average the middle two: (7 + 9)/2 = 8.", "Statistics"),
    ("If <i>f</i>(<i>x</i>) = <i>x</i> + 4 and <i>g</i>(<i>x</i>) = <i>x</i><super>2</super>, what is <i>f</i>(<i>g</i>(3))?", ["13", "16", "25", "49"], "F",
     "Work inside out: <i>g</i>(3) = 9, then <i>f</i>(9) = 13. Choice J is <i>g</i>(<i>f</i>(3)) — the order matters.", "Functions"),
    ("How many different 2-person committees can be chosen from a group of 6 people?", ["12", "15", "30", "36"], "B",
     "Order doesn't matter, so use combinations: 6C2 = (6 × 5)/2 = 15. Choice C counts each pair twice.", "Counting"),
    ("What is the value of cos 120°?", ["−√3/2", "−1/2", "1/2", "√3/2"], "G",
     "120° is in Quadrant II, where cosine is negative. Its reference angle is 60°, and cos 60° = 1/2, so cos 120° = −1/2.", "Trigonometry"),
]


def math_question(n: int, q):
    text, choices, *_ = q
    labels = letters(n)
    cells = [P(f"<b>{l}.</b>  {c}", "choice") for l, c in zip(labels, choices)]
    choice_t = Table([cells], colWidths=[1.6 * inch] * 4)
    choice_t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 20), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return KeepTogether([P(f"<b>{n}.</b>  {text}", "q"), choice_t, Spacer(1, 30)])


def act_math():
    answers = {i + 1: q[2] for i, q in enumerate(MATH_Q)}
    for i, q in enumerate(MATH_Q):
        assert q[2] in letters(i + 1), f"math {i + 1}: {q[2]} is not a valid letter"

    p1 = cover(
        "ACT Math",
        "ACT Math Practice Packet",
        "Thirty ACT-style questions covering the topics that show up most often on test day, with a strategy sheet up front and a worked explanation for every answer.",
        [("questions", "30"), ("suggested time", "34 min"), ("answer choices", "4 each"), ("calculator", "Allowed")],
        [
            ("1", "How to use the packet, and timing tips"),
            ("2", "Formula and strategy sheet: everything the ACT expects you to know by heart"),
            ("3–5", "Practice questions 1–30, getting harder as you go (just like the real test)"),
            ("6", "Answer key, score tracker and explanations for questions 1–10"),
            ("7", "Explanations for questions 11–30 and a topic checklist for what to study next"),
        ],
        [
            "Read the formula sheet on page 2, then put it away. The real ACT gives you no formulas.",
            "Set a timer for 34 minutes and do questions 1–30 in one sitting, about 68 seconds each.",
            "Circle any question you guess on, so you can review it even if you guessed right.",
            "Mark your answers in the key on page 6 and read the explanation for every question you missed or circled.",
            "Use the topic checklist on page 7 to decide what to practise next, or bring it to a session with your tutor.",
        ],
        "Five habits of high scorers",
        [
            "<b>Answer every question.</b> There is no penalty for guessing, so never leave a bubble blank.",
            "<b>Don't get stuck.</b> If a question takes more than 90 seconds, guess, circle it and come back at the end.",
            "<b>Plug in the answers.</b> When you're stuck on an equation, try each answer choice. Start with the middle value.",
            "<b>Pick your own numbers.</b> For variable-heavy questions, set <i>x</i> = 2 (not 0 or 1) and test the choices.",
            "<b>Re-read the question before bubbling.</b> Many wrong answers solve for the wrong thing, like <i>x</i> instead of 2<i>x</i>.",
        ],
    )

    def fsec(title, rows):
        return [P(title, "h3")] + [P(r, "small") for r in rows]

    left = (
        fsec("Algebra", [
            "Slope: <i>m</i> = (<i>y</i><sub>2</sub> − <i>y</i><sub>1</sub>)/(<i>x</i><sub>2</sub> − <i>x</i><sub>1</sub>)",
            "Slope-intercept: <i>y</i> = <i>mx</i> + <i>b</i>",
            "Parallel lines: equal slopes. Perpendicular: negative reciprocals (2/3 and −3/2)",
            "Quadratic formula: <i>x</i> = (−<i>b</i> ± √(<i>b</i><super>2</super> − 4<i>ac</i>)) / 2<i>a</i>",
            "Vertex form: <i>y</i> = <i>a</i>(<i>x</i> − <i>h</i>)<super>2</super> + <i>k</i>, vertex (<i>h</i>, <i>k</i>)",
            "Difference of squares: <i>a</i><super>2</super> − <i>b</i><super>2</super> = (<i>a</i> + <i>b</i>)(<i>a</i> − <i>b</i>)",
            "Exponents: <i>x</i><super>a</super>·<i>x</i><super>b</super> = <i>x</i><super>a+b</super>,  (<i>x</i><super>a</super>)<super>b</super> = <i>x</i><super>ab</super>,  <i>x</i><super>−a</super> = 1/<i>x</i><super>a</super>",
            "Logs: log<sub>b</sub> <i>x</i> = <i>y</i> means <i>b</i><super>y</super> = <i>x</i>",
            "Flip an inequality when you multiply or divide by a negative",
        ])
        + fsec("Coordinate geometry", [
            "Midpoint: ((<i>x</i><sub>1</sub> + <i>x</i><sub>2</sub>)/2, (<i>y</i><sub>1</sub> + <i>y</i><sub>2</sub>)/2)",
            "Distance: √((<i>x</i><sub>2</sub> − <i>x</i><sub>1</sub>)<super>2</super> + (<i>y</i><sub>2</sub> − <i>y</i><sub>1</sub>)<super>2</super>)",
            "Circle: (<i>x</i> − <i>h</i>)<super>2</super> + (<i>y</i> − <i>k</i>)<super>2</super> = <i>r</i><super>2</super>",
        ])
        + fsec("Sequences, percents and counting", [
            "Arithmetic: <i>a<sub>n</sub></i> = <i>a</i><sub>1</sub> + (<i>n</i> − 1)<i>d</i>.  Geometric: <i>a<sub>n</sub></i> = <i>a</i><sub>1</sub>·<i>r</i><super>n−1</super>",
            "Percent change = (new − old) / old × 100",
            "Combinations (order doesn't matter): <i>n</i>C<i>r</i> = <i>n</i>! / (<i>r</i>!(<i>n</i> − <i>r</i>)!)",
            "Probability = favourable outcomes / total outcomes",
        ])
    )
    right = (
        fsec("Geometry", [
            "Triangle area = ½<i>bh</i>.  Angles in a triangle add to 180°",
            "Pythagorean theorem: <i>a</i><super>2</super> + <i>b</i><super>2</super> = <i>c</i><super>2</super>",
            "Common right triangles: 3-4-5, 5-12-13, 8-15-17",
            "45-45-90 sides: <i>x</i>, <i>x</i>, <i>x</i>√2.  30-60-90 sides: <i>x</i>, <i>x</i>√3, 2<i>x</i>",
            "Circle: area π<i>r</i><super>2</super>, circumference 2π<i>r</i>",
            "Arc length = (θ/360°)·2π<i>r</i>",
            "Polygon interior angles total (<i>n</i> − 2)·180°",
            "Rectangular box volume = <i>lwh</i>.  Cylinder volume = π<i>r</i><super>2</super><i>h</i>",
        ])
        + fsec("Trigonometry", [
            "SOH-CAH-TOA: sin = opp/hyp, cos = adj/hyp, tan = opp/adj",
            "sin<super>2</super>θ + cos<super>2</super>θ = 1",
            "Unit circle signs: All positive in QI, Sin in QII, Tan in QIII, Cos in QIV",
            "Radians: 180° = π",
        ])
        + fsec("Statistics", [
            "Mean = sum ÷ count.  Sum = mean × count",
            "Median: middle value after sorting (average the middle two if the count is even)",
            "Mode: most frequent value.  Range: largest − smallest",
        ])
        + fsec("Complex numbers", [
            "<i>i</i> = √−1, <i>i</i><super>2</super> = −1, <i>i</i><super>3</super> = −<i>i</i>, <i>i</i><super>4</super> = 1",
        ])
    )
    sheet = Table([[left, right]], colWidths=[3.55 * inch, 3.45 * inch])
    sheet.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 14)]))
    p2 = [
        P("Formula & strategy sheet", "h2"),
        P("The ACT does not give you a formula sheet. Learn these until you can write them from memory.", "muted"),
        sheet,
        Spacer(1, 8),
        boxed([
            P("Strategy: plugging in the answers", "h3"),
            P("Question: <i>If 2</i><super>x+1</super><i> = 32, what is x?</i>  The choices are 3, 4, 5 and 6. Start with a middle choice, 4: 2<super>5</super> = 32. Done! "
              "Plugging in is often faster than algebra when the choices are numbers and the question asks for a single value.", "small"),
        ], bg=ACCENT_SOFT),
    ]

    qpage = lambda start, end, heading: [P(heading, "h2"), P("Work in the space provided. Choose the best answer.", "muted"), Spacer(1, 4)] + [
        math_question(i + 1, MATH_Q[i]) for i in range(start, end)
    ]
    p3 = qpage(0, 10, "Practice questions 1–10  ·  Warm-up")
    p4 = qpage(10, 20, "Practice questions 11–20  ·  Core skills")
    p5 = qpage(20, 30, "Practice questions 21–30  ·  Challenge") + [Spacer(1, 2), P("<b>STOP.</b>  Note your end time, then check your answers on page 6.", "center")]

    score_rows = [["Correct (out of 30)", "27–30", "23–26", "18–22", "12–17", "0–11"],
                  ["Where you are", "Excellent", "Strong", "Solid", "Building", "Getting started"]]
    explain = [(i + 1, q[2], q[3]) for i, q in enumerate(MATH_Q)]
    p6 = [
        P("Answer key", "h2"),
        answer_grid(answers),
        Spacer(1, 8),
        P("How did you do?", "h3"),
        grid(score_rows, [1.5 * inch] + [1.1 * inch] * 5),
        P("These bands describe this packet only. They are not official ACT scores.", "muted"),
        P("Worked explanations", "h2"),
        *explanations(explain[:10]),
    ]
    topics: dict[str, list[int]] = {}
    for i, q in enumerate(MATH_Q):
        topics.setdefault(q[4], []).append(i + 1)
    items = [[t, ", ".join(map(str, ns)), ""] for t, ns in sorted(topics.items())]
    half = (len(items) + 1) // 2
    topic_rows = [["Topic", "Questions", "Missed?"] * 2] + [
        items[i] + (items[i + half] if i + half < len(items) else ["", "", ""]) for i in range(half)
    ]
    p7 = [
        P("Worked explanations (continued)", "h2"),
        *explanations(explain[10:]),
        Spacer(1, 6),
        P("Topic checklist: what to study next", "h3"),
        grid(topic_rows, [1.45 * inch, 1.3 * inch, 0.75 * inch] * 2, font_size=7.6),
    ]
    build(OUT / "act-math-practice-packet.pdf", "ACT Math Practice Packet", "ACT Math", [p1, p2, p3, p4, p5, p6, p7])


# ---------------------------------------------------------------------------
# ACT English
# ---------------------------------------------------------------------------

def u(text: str, n: int) -> str:
    """An underlined, numbered portion of a passage."""
    return f"<u>{text}</u><super><b>{n}</b></super>"


def mark(n: int) -> str:
    """A numbered box marking a spot in the passage (for questions about the whole sentence/paragraph)."""
    return f"<b>[{n}]</b>"


PASSAGES = [
    {
        "title": "Passage I — The Library on Wheels",
        "paras": [
            f"In 1905, Mary Lemist Titcomb, the librarian of the Washington County Free Library in Hagerstown, Maryland, faced a problem. Many of the county's farm families lived miles from town, and {u('they’re', 1)} children rarely saw a book outside of school. Titcomb believed that if people could not come to the library, {u('than', 2)} the library would have to come to them.",
            f"Her solution was a black, horse-drawn wagon {u('lined with shelves, it', 3)} carried books along the county's dirt roads. The library's janitor, Joshua Thomas, drove the wagon, {u('stopping at farmhouses, general stores, and', 4)} crossroads. Families {u('whom had never owned', 5)} more than a few books could now borrow novels, histories and guides to farming.",
            f"The service proved so popular that when a freight train struck the wagon at a railroad crossing in 1910, the county {u('eventually, in the end, replaced', 6)} it with a motor truck. {u('Similarly,', 7)} the idea of a traveling library spread to other states. By the middle of the century, bookmobiles {u('was serving', 8)} readers across the country.",
            f"Today, a modern bookmobile with its laptops, Wi-Fi hotspots and thousands of books {u('visit', 9)} schools, nursing homes and neighborhoods that have no branch library of their own. {mark(10)}",
        ],
        "questions": [
            (["NO CHANGE", "their", "there", "they are"], "B", "<i>Their</i> shows possession (the families' children). <i>They're</i> means \"they are\"; <i>there</i> is a place."),
            (["NO CHANGE", "then", "and", "so"], "G", "An \"if … then\" sentence needs <i>then</i> (time/sequence). <i>Than</i> is only for comparisons."),
            (["NO CHANGE", "lined with shelves that", "lined with shelves, they", "lined with shelves it"], "B", "The original is a comma splice: two complete sentences joined by a comma. <i>That</i> turns the second part into a description of the wagon."),
            (["NO CHANGE", "stopping at farmhouses general stores and", "stopping at: farmhouses, general stores, and", "stopping, at farmhouses, general stores and"], "F", "Items in a list of three are separated by commas. A colon can't come right after a preposition like <i>at</i>."),
            (["NO CHANGE", "who had never owned", "which had never owned", "whose never owning"], "B", "<i>Who</i> is the subject of <i>had owned</i>, so it must be the subject form. Use <i>whom</i> only for objects (him → whom)."),
            (["NO CHANGE", "eventually, in the end, finally replaced", "replaced", "in the end eventually replaced"], "H", "<i>Eventually</i> and <i>in the end</i> mean the same thing. The ACT rewards the shortest choice that is still correct and clear."),
            (["NO CHANGE", "For example,", "In contrast,", "Over the following decades,"], "D", "Nothing earlier was similar to the idea spreading. The sentence moves forward in time, so a time transition fits."),
            (["NO CHANGE", "were serving", "has served", "is serving"], "G", "The subject <i>bookmobiles</i> is plural and the sentence is in the past, so <i>were serving</i>."),
            (["NO CHANGE", "visits", "have visited", "are visiting"], "B", "The subject is <i>a modern bookmobile</i> (singular). Ignore the phrase \"with its laptops … books\" between subject and verb."),
            (["Yes, because it traces the bookmobile from Titcomb's 1905 wagon to the vehicles still in use today.", "Yes, because it explains how Titcomb trained other librarians.", "No, because it focuses only on the original wagon.", "No, because it mostly describes farm life in Maryland."], "F", "The essay follows the idea from 1905 to the 1910 truck, to other states, to today's bookmobiles. That is a lasting influence."),
        ],
        "q10": "Suppose the writer's goal had been to show that Titcomb's idea has had a lasting influence. Does the essay accomplish this goal?",
    },
    {
        "title": "Passage II — The Thinking Arms of the Octopus",
        "paras": [
            f"With roughly five hundred million neurons, the common octopus has a nervous system {u('more closer in size to', 11)} that of a dog than to that of a snail. What makes the octopus unusual, however, is {u('where it’s', 12)} neurons are located: about two-thirds of them are found not in its brain but in its eight arms.",
            f"Because each arm can taste, touch and react on its own, an octopus can search a crevice with one arm {u('while', 13)} another pries open a shell. Researchers have watched octopuses unscrew jar lids, slip out of tanks {u('and recognizing', 14)} individual human keepers.",
            f"Such intelligence is surprising {u('given that', 15)} octopuses live short, solitary lives. Most species survive only a year or two, and the young never meet their parents. {u('However,', 16)} octopuses cannot learn from older generations the way crows or chimpanzees do. Every skill an octopus has, it must figure out {u('for themself', 17)}.",
            f"Some scientists think the answer lies in the octopus's {u('soft, boneless', 18)} body. Without a shell to protect it, an octopus must outthink predators {u('such as: eels, sharks, and seals', 19)}. {mark(20)}",
        ],
        "questions": [
            (["NO CHANGE", "more close in size to", "closer in size to", "most close in size to"], "C", "Use <i>-er</i> OR <i>more</i>, never both. Comparing two things (dog vs snail) needs the comparative <i>closer</i>."),
            (["NO CHANGE", "where its", "where its'", "where their"], "G", "<i>Its</i> (no apostrophe) is possessive. <i>It's</i> always means \"it is\". <i>Its'</i> is never correct, and <i>their</i> is plural."),
            (["NO CHANGE", "although", "unless", "because"], "A", "The two actions happen at the same time, which is exactly what <i>while</i> means."),
            (["NO CHANGE", "and they recognize", "and recognize", "and recognizing of"], "H", "Items in a list must be parallel: <i>unscrew</i>, <i>slip</i> and <i>recognize</i>."),
            (["NO CHANGE", "despite", "even though the fact", "given"], "A", "<i>Given that</i> correctly introduces the reason the intelligence is surprising. <i>Despite</i> can't be followed by a full clause."),
            (["NO CHANGE", "Consequently,", "Nevertheless,", "On the other hand,"], "G", "Never meeting their parents CAUSES octopuses to miss out on learning from them, so a cause-and-effect transition is needed."),
            (["NO CHANGE", "for themselves", "for itself", "by themself"], "C", "The pronoun refers to <i>an octopus</i>, which is singular and not a person: <i>itself</i>."),
            (["NO CHANGE", "soft boneless,", "soft, boneless,", "soft; boneless"], "F", "Put a comma between two adjectives when you could put <i>and</i> between them (soft and boneless). No comma before the noun."),
            (["NO CHANGE", "such as eels, sharks, and seals", "such as, eels, sharks and seals", "such as eels sharks and seals"], "B", "Don't put a colon or comma right after <i>such as</i>. The list still needs commas between its items."),
            (["Many aquariums now offer octopus exhibits.", "Eels are also found on coral reefs around the world.", "In the end, the octopus's thinking arms may be exactly what lets a short-lived, soft-bodied animal survive by its wits.", "Seals mostly eat fish."], "H", "The first paragraph introduced the neurons in the arms. Only H returns to that idea and ties it to survival."),
        ],
        "q20": "Which choice most effectively concludes the passage by returning to an idea from the first paragraph?",
    },
    {
        "title": "Passage III — Learning to Fail Well",
        "paras": [
            f"When I joined my school's robotics team in ninth grade, I assumed the hardest part would be the {u('coding, I was wrong.', 21)} The hardest part was watching something I had built fall apart in front of two hundred people, {u('including my parents and I', 22)}.",
            f"Our robot, {u('which we had named Gizmo,', 23)} was supposed to stack three cubes in under a minute. During practice it worked perfectly. On competition day, {u('however', 24)}, Gizmo's arm froze halfway through the first lift, and the cube {u('has tumbled', 25)} onto the floor.",
            f"I wanted to disappear. {mark(26)} Instead, our coach knelt beside the robot and asked, \"What do you think happened?\" {u('Spending the next ten minutes before our second round, a loose wire was found to be the problem', 27)}. We traced the trouble to a single loose {u('wire. A wire that', 28)} had shaken free during the bus ride.",
            f"We fixed it, and Gizmo stacked all three cubes in {u('a time of forty-eight seconds in length', 29)}. We didn't win the tournament, but I left with something more {u('valuable. The', 30)} knowledge that a failure is only a problem you haven't solved yet.",
        ],
        "questions": [
            (["NO CHANGE", "coding; I was wrong.", "coding I was wrong.", "coding, and, I was wrong."], "B", "Two complete sentences can't be joined with just a comma. A semicolon (or a period) fixes the comma splice."),
            (["NO CHANGE", "including my parents and me", "including me and my parents'", "including myself and my parents"], "G", "After a preposition like <i>including</i>, use the object form <i>me</i>. Test it alone: \"in front of … me,\" not \"I\"."),
            (["NO CHANGE", "which we had named Gizmo", "that we had named Gizmo,", ", which, we had named Gizmo"], "A", "Extra information about a noun that's already named goes between a pair of commas, with <i>which</i>."),
            (["NO CHANGE", "therefore", "for example", "similarly"], "F", "Practice went perfectly but competition went badly: that's a contrast, so <i>however</i> is right."),
            (["NO CHANGE", "tumbled", "will tumble", "tumbling"], "B", "The story is told in the simple past (<i>froze</i>), so the verb should be <i>tumbled</i>."),
            (["Yes, because it describes the robot.", "Yes, because it explains why the arm froze.", "No, because it interrupts the writer's reaction with an unrelated detail.", "No, because the robot's color is mentioned earlier."], "H", "Gizmo's paint color has nothing to do with the writer wanting to disappear or the coach's question."),
            (["NO CHANGE", "We spent the next ten minutes before our second round tracing the problem", "A loose wire, spending the next ten minutes before our second round, was the problem", "The next ten minutes before our second round, we spent them tracing the problem"], "B", "In A, the wire seems to be doing the \"spending\": a dangling modifier. B names who spent the time: <i>we</i>."),
            (["NO CHANGE", "wire, one that", "wire; that", "wire. Which"], "G", "\"A wire that had shaken free …\" has no main verb, so it is a fragment. A comma attaches it to the sentence as a description."),
            (["NO CHANGE", "forty-eight seconds", "a forty-eight-second length of time", "forty-eight seconds of time"], "B", "Seconds are already a time and a length. The shortest correct choice is best."),
            (["NO CHANGE", "valuable; the", "valuable: the", "valuable the"], "H", "\"The knowledge that …\" isn't a complete sentence, so it can't follow a period or semicolon. A colon introduces the explanation."),
        ],
        "q26": "At this point, the writer is considering adding the following sentence: <i>Gizmo was painted bright orange.</i> Should the writer make this addition here?",
    },
]


def english_page(passage, first: int):
    left = [P(passage["title"], "h3")] + [P(t, "passage") for t in passage["paras"]]
    right = []
    for i, (choices, _ans, _exp) in enumerate(passage["questions"]):
        n = first + i
        stem = passage.get(f"q{n}")
        if stem:
            right.append(P(f"<b>{n}.</b>  {stem}", "eq"))
        labels = letters(n)
        lines = [f"<b>{labels[0]}.</b>  {choices[0]}"] + [f"<b>{l}.</b>  {c}" for l, c in zip(labels[1:], choices[1:])]
        if stem:
            right += [P(line, "eqc") for line in lines]
        else:
            right.append(P(f"<b>{n}.</b>  {lines[0]}", "eq"))
            right += [P(line, "eqc") for line in lines[1:]]
        right.append(Spacer(1, 4))
    t = Table([[left, right]], colWidths=[3.9 * inch, 3.1 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 12),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
        ("LINEBEFORE", (1, 0), (1, 0), 0.6, LINE),
    ]))
    return [t]


def act_english():
    answers, explain = {}, []
    for p_i, passage in enumerate(PASSAGES):
        for i, (_c, ans, exp) in enumerate(passage["questions"]):
            n = p_i * 10 + i + 1
            assert ans in letters(n), f"english {n}: {ans} is not a valid letter"
            answers[n] = ans
            explain.append((n, ans, exp))

    p1 = cover(
        "ACT English",
        "ACT English Practice Packet",
        "Three ACT-style passages with 30 questions on grammar, punctuation, word choice and writing strategy, a one-page rule sheet, and an explanation for every answer.",
        [("passages", "3"), ("questions", "30"), ("suggested time", "21 min"), ("per question", "~40 sec")],
        [
            ("1", "How to use the packet, and the four question types you'll see"),
            ("2", "Rule sheet: the grammar and punctuation rules the ACT tests most"),
            ("3", "Passage I, The Library on Wheels (questions 1–10)"),
            ("4", "Passage II, The Thinking Arms of the Octopus (questions 11–20)"),
            ("5", "Passage III, Learning to Fail Well (questions 21–30)"),
            ("6–7", "Answer key, score tracker and an explanation for every question"),
        ],
        [
            "Study the rule sheet on page 2 first. Most ACT English questions test the same dozen rules.",
            "Set a timer for 21 minutes (7 minutes per passage) and work through pages 3–5.",
            "Read the whole sentence around each underlined part before you choose. Some answers depend on the next sentence.",
            "Check your answers on page 6, then read the explanation for every question you missed or guessed on.",
            "Note which rules you missed in the tracker on page 7 and review them before your next practice.",
        ],
        "How ACT English questions work",
        [
            "<b>Underlined portions</b> are numbered in the passage. The matching question offers ways to rewrite them.",
            "<b>\"NO CHANGE\"</b> is the first choice for many questions. It is correct about as often as any other letter, so pick it when the original is right.",
            "<b>Shorter is usually better.</b> When two choices are both grammatical, the ACT prefers the concise one.",
            "<b>Bracketed numbers</b> like [10] mark questions about a whole sentence, paragraph or the essay's purpose.",
            "<b>Answer every question.</b> There is no penalty for guessing.",
        ],
    )

    rules = [
        ("Commas", [
            "Never join two complete sentences with only a comma (a <i>comma splice</i>). Use a period, a semicolon, or a comma + <i>and/but/so</i>.",
            "Put a pair of commas around extra (non-essential) information: <i>My robot, which I named Gizmo, froze.</i>",
            "Separate items in a list: <i>eels, sharks, and seals</i>. No comma right after <i>such as</i> or <i>including</i>.",
            "Don't put a comma between a subject and its verb, or between a verb and its object.",
        ]),
        ("Semicolons, colons and dashes", [
            "A semicolon joins two complete sentences that are closely related. Both sides must be able to stand alone.",
            "A colon comes after a complete sentence and introduces a list, an explanation or an example.",
            "A dash works like a colon at the end of a sentence, or like a pair of commas around extra information.",
        ]),
        ("Apostrophes and sound-alikes", [
            "<i>its</i> = belonging to it; <i>it's</i> = it is.  <i>their</i> = belonging to them; <i>they're</i> = they are; <i>there</i> = a place.",
            "<i>than</i> compares; <i>then</i> shows time or sequence.  Singular possessive: <i>the dog's</i>; plural: <i>the dogs'</i>.",
        ]),
        ("Verbs", [
            "Subject-verb agreement: find the real subject and ignore phrases in between. <i>A box of books <b>is</b> heavy.</i>",
            "Keep tenses consistent with the rest of the passage unless the timing actually changes.",
        ]),
        ("Pronouns", [
            "A pronoun must match the noun it replaces: <i>an octopus … itself</i>, <i>octopuses … themselves</i>.",
            "Subject forms: <i>I, he, she, we, they, who</i>.  Object forms: <i>me, him, her, us, them, whom</i>.",
            "Trick: remove the other person. <i>My parents and (I/me)</i> → <i>in front of me</i>.",
        ]),
        ("Modifiers and parallelism", [
            "An introductory phrase describes whatever comes right after the comma. <i>Running late, <b>I</b> missed the bus</i>, not <i>the bus was missed</i>.",
            "Items in a list or comparison take the same form: <i>to read, to write, and to edit</i>.",
            "Comparatives: <i>-er</i> or <i>more</i> for two things; <i>-est</i> or <i>most</i> for three or more. Never both.",
        ]),
        ("Rhetorical skills", [
            "<b>Transitions:</b> decide the relationship first. Contrast: <i>however</i>. Cause: <i>therefore, consequently</i>. Example: <i>for instance</i>. Addition: <i>also, furthermore</i>.",
            "<b>Add or delete?</b> Keep a sentence only if it supports the paragraph's main point. A colorful detail that drifts off topic should go.",
            "<b>Concision:</b> cut words that repeat an idea (<i>eventually, in the end</i>) or say nothing new.",
            "<b>Purpose questions:</b> read the question's goal carefully, then check whether the essay as a whole does it.",
        ]),
    ]
    p2 = [P("Rule sheet: what ACT English tests most", "h2"), P("Learn these and you'll recognise the answer to most questions in seconds.", "muted")]
    for title, items in rules:
        p2 += [P(title, "h3")] + [P(f"•  {r}", "small") for r in items]

    def passage_page(i):
        return [P(f"Passage {'I' * (i + 1) if i < 3 else i + 1}  ·  Questions {i * 10 + 1}–{i * 10 + 10}", "h2"),
                P("Read the passage. For each numbered portion, choose the best answer. If the original is best, choose NO CHANGE.", "muted")] + english_page(PASSAGES[i], i * 10 + 1)

    p3, p4, p5 = passage_page(0), passage_page(1), passage_page(2)
    p5 += [Spacer(1, 6), P("<b>STOP.</b>  Note your end time, then check your answers on page 6.", "center")]

    score_rows = [["Correct (out of 30)", "27–30", "23–26", "18–22", "12–17", "0–11"],
                  ["Where you are", "Excellent", "Strong", "Solid", "Building", "Getting started"]]
    p6 = [
        P("Answer key", "h2"),
        answer_grid(answers),
        Spacer(1, 8),
        P("How did you do?", "h3"),
        grid(score_rows, [1.5 * inch] + [1.1 * inch] * 5),
        P("These bands describe this packet only. They are not official ACT scores.", "muted"),
        P("Explanations", "h2"),
        *explanations(explain[:14], "eq"),
    ]
    tracker = [["Rule", "Questions", "Missed?"],
               ["Commas, comma splices, fragments", "3, 4, 19, 21, 23, 28", ""],
               ["Semicolons, colons", "21, 30", ""],
               ["Apostrophes and sound-alikes", "1, 2, 12", ""],
               ["Verbs: agreement and tense", "8, 9, 25", ""],
               ["Pronouns", "5, 17, 22", ""],
               ["Modifiers, parallelism, comparisons", "11, 14, 18, 27", ""],
               ["Transitions and logic", "7, 13, 15, 16, 24", ""],
               ["Concision", "6, 29", ""],
               ["Add/delete, purpose, conclusions", "10, 20, 26", ""]]
    p7 = [
        P("Explanations (continued)", "h2"),
        *explanations(explain[14:], "eq"),
        Spacer(1, 6),
        P("Rule tracker: what to study next", "h3"),
        grid(tracker, [2.9 * inch, 2.4 * inch, 1.0 * inch], font_size=8),
    ]
    build(OUT / "act-english-practice-packet.pdf", "ACT English Practice Packet", "ACT English", [p1, p2, p3, p4, p5, p6, p7])


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    act_math()
    act_english()
