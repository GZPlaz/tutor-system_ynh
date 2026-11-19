"""
Builds ACT practice packets 2-5 for Math and English (10 pages each) from
content_math.py and content_english.py:

    python3 tools/packets/build_series.py

Layout of every packet:
    1      cover: what's inside, how to use it, tips
    2-3    lesson pages with worked examples
    4-8    practice (Math: 6 questions per page; English: one passage + 6 questions per page)
    9-10   answer key, score bands, explanations and a topic/rule tracker

The script fails if a packet is not exactly 10 pages, if an answer letter is impossible,
or if the text uses a character the font can't draw.
"""
from __future__ import annotations

import html
import random
import re
import sys
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fontTools.ttLib import TTFont as FTFont  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import KeepTogether, Spacer, Table, TableStyle  # noqa: E402

import build_act_packets as base  # noqa: E402
from build_act_packets import ACCENT_SOFT, LINE, OUT, P, answer_grid, boxed, cover, explanations, grid, letters  # noqa: E402
import content_english  # noqa: E402
import content_math  # noqa: E402

base.PAGES = 10
base.S["lesson"] = base.ParagraphStyle("lesson", parent=base.S["body"], leftIndent=12, firstLineIndent=-9, spaceAfter=4)
ALL_TEXT: list[str] = []  # every string drawn, for the glyph check


def T(s: str) -> str:
    ALL_TEXT.append(s)
    return s


# ---------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------

def lesson_page(items, heading: str | None):
    out = [P(T(heading), "h2")] if heading else []
    for kind, text in items:
        T(text)
        if kind == "h":
            out.append(P(text, "h3"))
        elif kind == "p":
            out.append(P(text, "body"))
        elif kind == "b":
            out.append(P(f"•  {text}", "lesson"))
        elif kind == "ex":
            out += [Spacer(1, 2), boxed([P(f"<b>Example.</b>  {text}", "body")], bg=ACCENT_SOFT, pad=8), Spacer(1, 5)]
        else:
            raise ValueError(kind)
    return out


SCORE_ROWS = [["Correct (out of 30)", "27–30", "23–26", "18–22", "12–17", "0–11"],
              ["Where you are", "Excellent", "Strong", "Solid", "Building", "Getting started"]]


def key_and_explanations(answers, explain, tracker_title, tracker_rows, tracker_widths):
    return [
        P("Answer key", "h2"),
        answer_grid(answers),
        Spacer(1, 8),
        P("How did you do?", "h3"),
        grid(SCORE_ROWS, [1.5 * inch] + [1.1 * inch] * 5),
        P("These bands describe this packet only. They are not official ACT scores.", "muted"),
        P("Explanations", "h2"),
        *explanations(explain, "eq"),
        Spacer(1, 8),
        KeepTogether([P(tracker_title, "h3"), grid(tracker_rows, tracker_widths, font_size=7.8)]),
    ]


def two_up(items: list[list[str]], header: list[str]):
    half = (len(items) + 1) // 2
    rows = [header * 2]
    for i in range(half):
        rows.append(items[i] + (items[i + half] if i + half < len(items) else [""] * len(header)))
    return rows


# ---------------------------------------------------------------------------
# Math
# ---------------------------------------------------------------------------

def as_number(choice: str):
    s = re.sub(r"<[^>]+>", "", choice)
    s = s.replace("$", "").replace(",", "").replace("%", "").replace("°", "").replace("−", "-")
    s = re.sub(r"\s*(ft|g|miles)$", "", s.strip())
    try:
        return Fraction(s)
    except (ValueError, ZeroDivisionError):
        return None


def order_choices(choices: list[str], seed: str) -> tuple[list[str], int]:
    """Correct answer is choices[0]. Numbers are listed in increasing order (as on the ACT); anything else is shuffled."""
    correct = choices[0]
    nums = [as_number(c) for c in choices]
    if all(n is not None for n in nums):
        ordered = [c for _, c in sorted(zip(nums, choices), key=lambda t: t[0])]
    else:
        ordered = choices[:]
        random.Random(seed).shuffle(ordered)
    assert len(set(ordered)) == 4, f"duplicate choices in {seed}: {choices}"
    return ordered, ordered.index(correct)


def math_question(n: int, stem: str, choices: list[str]):
    labels = letters(n)
    cells = [P(f"<b>{l}.</b>  {c}", "choice") for l, c in zip(labels, choices)]
    long = max(len(re.sub(r"<[^>]+>", "", c)) for c in choices) > 22
    if long:
        t = Table([[cells[0], cells[1]], [cells[2], cells[3]]], colWidths=[3.2 * inch] * 2)
    else:
        t = Table([cells], colWidths=[1.6 * inch] * 4)
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 20), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return KeepTogether([P(f"<b>{n}.</b>  {stem}", "q"), t, Spacer(1, 52)])


def build_math(spec):
    qs = spec["questions"]
    assert len(qs) == 30, spec["slug"]
    answers, explain, topics, rendered = {}, [], {}, []
    for i, (stem, choices, expl, topic) in enumerate(qs):
        n = i + 1
        T(stem), T(expl), [T(c) for c in choices]
        ordered, idx = order_choices(choices, f"{spec['slug']}-{n}")
        answers[n] = letters(n)[idx]
        explain.append((n, answers[n], expl))
        topics.setdefault(topic, []).append(n)
        rendered.append(math_question(n, stem, ordered))

    minutes = spec["minutes"]
    p1 = cover(
        "ACT Math", spec["title"], T(spec["blurb"]),
        [("questions", "30"), ("suggested time", f"{minutes} min"), ("answer choices", "4 each"), ("calculator", "Allowed")],
        [("1", "How to use the packet, and tips for this topic"),
         ("2–3", "Lessons: the rules and formulas you need, each with a worked example"),
         ("4–8", "Practice questions 1–30, getting harder as you go"),
         ("9–10", "Answer key, score bands, an explanation for every question and a topic checklist")],
        ["Read the two lesson pages and work through each example yourself before looking at the solution.",
         f"Set a timer for {minutes} minutes and do questions 1–30 in one sitting.",
         "Circle any question you guess on, so you can review it even if you guessed right.",
         "Mark your answers against the key on page 9 and read the explanation for every question you missed or circled.",
         "Tick the topics you missed in the checklist on page 10, then reread that part of the lesson."],
        "Tips for this topic", [T(t) for t in spec["tips"]], number=spec["number"],
    )
    p2 = lesson_page(spec["lesson"][0], "Lesson: what you need to know")
    p3 = lesson_page(spec["lesson"][1], "Lesson (continued)")
    q_pages = []
    for k in range(5):
        page = [P(f"Practice questions {k * 6 + 1}–{k * 6 + 6}", "h2"), P("Work in the space provided. Choose the best answer.", "muted")]
        page += rendered[k * 6:(k + 1) * 6]
        if k == 4:
            page.append(P("<b>STOP.</b>  Note your end time, then check your answers on page 9.", "center"))
        q_pages.append(page)
    tracker = two_up([[t, ", ".join(map(str, ns)), ""] for t, ns in sorted(topics.items())], ["Topic", "Questions", "Missed?"])
    tail = key_and_explanations(answers, explain, "Topic checklist: what to study next", tracker, [1.5 * inch, 1.25 * inch, 0.75 * inch] * 2)
    pages = [p1, p2, p3, *q_pages, tail]
    write(spec, "ACT Math", pages)
    return answers


# ---------------------------------------------------------------------------
# English
# ---------------------------------------------------------------------------

MARK = re.compile(r"\[\[(#?)([^\]|]*?)(?:\|(\d+))?\]\]")


def render_passage(text: str, offset: int) -> str:
    def sub(m):
        if m.group(1) == "#":
            return f"<b>[{int(m.group(2)) + offset}]</b>"
        return f"<u>{m.group(2)}</u><super><b>{int(m.group(3)) + offset}</b></super>"
    out = MARK.sub(sub, text)
    assert "[[" not in out, out
    return out


def order_english(choices: list[str], correct: int, seed: str) -> tuple[list[str], int]:
    right = choices[correct]
    if choices[0] == content_english.NC:
        rest = choices[1:]
        random.Random(seed).shuffle(rest)
        ordered = [choices[0], *rest]
    else:
        ordered = choices[:]
        random.Random(seed).shuffle(ordered)
    assert len(set(ordered)) == 4, f"duplicate choices in {seed}"
    return ordered, ordered.index(right)


def build_english(spec):
    answers, explain, rules, pages = {}, [], {}, []
    roman = ["I", "II", "III", "IV", "V"]
    assert len(spec["passages"]) == 5, spec["slug"]
    for p_i, passage in enumerate(spec["passages"]):
        offset = p_i * 6
        assert len(passage["questions"]) == 6, (spec["slug"], p_i)
        for k in range(1, 7):  # every question has a spot in the passage
            assert any(f"|{k}]]" in t or f"[[#{k}]]" in t for t in passage["paras"]), (spec["slug"], p_i, k)
        left = [P(T(f"Passage {roman[p_i]}: {passage['title']}"), "h3")] + [P(T(render_passage(t, offset)), "passage") for t in passage["paras"]]
        right = []
        for i, (choices, correct, expl, rule, stem) in enumerate(passage["questions"]):
            n = offset + i + 1
            ordered, idx = order_english(choices, correct, f"{spec['slug']}-{n}")
            answers[n] = letters(n)[idx]
            explain.append((n, answers[n], T(expl)))
            rules.setdefault(rule, []).append(n)
            labels = letters(n)
            lines = [f"<b>{l}.</b>  {T(c)}" for l, c in zip(labels, ordered)]
            if stem:
                right.append(P(f"<b>{n}.</b>  {T(stem)}", "eq"))
                right += [P(line, "eqc") for line in lines]
            else:
                right.append(P(f"<b>{n}.</b>  {lines[0]}", "eq"))
                right += [P(line, "eqc") for line in lines[1:]]
            right.append(Spacer(1, 5))
        t = Table([[left, right]], colWidths=[3.85 * inch, 3.15 * inch])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 12),
            ("LEFTPADDING", (1, 0), (1, 0), 12),
            ("LINEBEFORE", (1, 0), (1, 0), 0.6, LINE),
        ]))
        page = [P(f"Passage {roman[p_i]}  ·  Questions {offset + 1}–{offset + 6}", "h2"),
                P("For each numbered portion, choose the best answer. If the original is best, choose NO CHANGE. "
                  "Questions with a boxed number ask about the passage as a whole.", "muted"), t]
        if p_i == 4:
            page += [Spacer(1, 8), P("<b>STOP.</b>  Note your end time, then check your answers on page 9.", "center")]
        pages.append(page)

    p1 = cover(
        "ACT English", spec["title"], T(spec["blurb"]),
        [("passages", "5"), ("questions", "30"), ("suggested time", "18 min"), ("per question", "~35 sec")],
        [("1", "How to use the packet, and tips for this topic"),
         ("2–3", "Lessons: the rules, with right and wrong examples"),
         ("4–8", "Five practice passages, six questions each"),
         ("9–10", "Answer key, score bands, an explanation for every question and a rule tracker")],
        ["Read the lesson pages first and say each rule in your own words.",
         "Set a timer for 18 minutes (about 3½ minutes per passage) and work through pages 4–8.",
         "Read the whole sentence around each underlined part before choosing. Some answers depend on the next sentence.",
         "Check your answers on page 9 and read the explanation for every question you missed or guessed on.",
         "Tick the rules you missed in the tracker on page 10, then reread that part of the lesson."],
        "Tips for this topic", [T(t) for t in spec["tips"]], number=spec["number"],
    )
    p2 = lesson_page(spec["lesson"][0], "Lesson: the rules")
    p3 = lesson_page(spec["lesson"][1], "Lesson (continued)")
    tracker = two_up([[r, ", ".join(map(str, ns)), ""] for r, ns in sorted(rules.items())], ["Rule", "Questions", "Missed?"])
    tail = key_and_explanations(answers, explain, "Rule tracker: what to study next", tracker, [1.6 * inch, 1.15 * inch, 0.75 * inch] * 2)
    write(spec, "ACT English", [p1, p2, p3, *pages, tail])
    return answers


# ---------------------------------------------------------------------------

def write(spec, subject, pages):
    # Pages 1-8 are one page each; the last block (key + explanations + tracker) flows over pages 9-10.
    from reportlab.platypus import PageBreak
    doc, frame = base.make_doc(OUT / f"{spec['slug']}.pdf", spec["title"], subject)
    story = []
    for i, page in enumerate(pages):
        story += page
        if i < len(pages) - 1:
            story.append(PageBreak())
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    from pypdf import PdfReader
    path = OUT / f"{spec['slug']}.pdf"
    n = len(PdfReader(str(path)).pages)
    if n != base.PAGES:
        sys.exit(f"{path.name} has {n} pages; expected {base.PAGES}.")
    print(f"wrote {path.relative_to(base.ROOT)} ({n} pages, {path.stat().st_size // 1024} KB)")


def check_glyphs():
    cmap = FTFont(str(base.FONT_DIR / "LiberationSans-Regular.ttf")).getBestCmap()
    missing = {}
    for s in ALL_TEXT:
        plain = html.unescape(re.sub(r"<[^>]+>", "", s))
        for ch in plain:
            if ord(ch) not in cmap and ch not in "\n":
                missing.setdefault(ch, plain[:60])
    if missing:
        sys.exit("Characters the font can't draw: " + ", ".join(f"{c!r} (U+{ord(c):04X}) in “{ctx}”" for c, ctx in missing.items()))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {}
    for spec in content_math.PACKETS:
        summary[spec["slug"]] = build_math(spec)
    for spec in content_english.PACKETS:
        summary[spec["slug"]] = build_english(spec)
    check_glyphs()
    for slug, ans in summary.items():
        counts = {l: list(ans.values()).count(l) for l in "ABCDFGHJ"}
        print(f"  {slug}: " + " ".join(f"{k}{v}" for k, v in counts.items()))
