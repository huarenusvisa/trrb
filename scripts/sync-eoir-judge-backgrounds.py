#!/usr/bin/env python3
"""Collect verified immigration-judge appointment biographies from DOJ/EOIR."""

import io
import html
import json
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import requests
from pypdf import PdfReader


SOURCES = Path(os.environ.get("EOIR_BIO_SOURCES", "data/immigration-judge-biography-sources.json"))
OUTPUT = Path(os.environ.get("EOIR_BIO_OUTPUT", "data/immigration-judge-backgrounds.json"))
LOCAL_PDF = os.environ.get("EOIR_BIO_PDF_PATH")
DOJ_NEWS_API = "https://www.justice.gov/api/v1/press_releases.json"


def clean(value):
    value = re.sub(r"\s+", " ", value or "").strip()
    value = re.sub(r"EOIR Announces .*? Page \d+", " ", value, flags=re.I)
    value = re.sub(r"Executive Office for Immigration Review, Office of Policy", " ", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip()


def name_key(name):
    name = re.sub(r"\b(?:Jr\.?|Sr\.?|II|III|IV)\b", "", name, flags=re.I)
    parts = [x.lower() for x in re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", name)]
    if len(parts) < 2:
        return " ".join(parts)
    return f"{parts[-1]}|{parts[0]}"


class BiographyHTMLParser(HTMLParser):
    BLOCKS = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def html_text(value):
    parser = BiographyHTMLParser()
    parser.feed(value or "")
    return html.unescape("".join(parser.parts))


def parse_text(source, raw_text):
    heading = re.compile(
        r"(?mi)^\s*([A-ZÀ-ÖØ-Þ][^\n,]{2,100}),\s+((?:(?:Temporary|Assistant Chief|Unit Chief|Regional Deputy Chief)\s+)?Immigration Judge),?\s+([^\n]{2,180})\s*$"
    )
    profiles = {}
    text = raw_text.replace("\u00a0", " ").replace("\u2019", "'").replace("\u2013", "-")
    matches = list(heading.finditer(text))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        biography = clean(text[match.end():end])
        biography = re.split(r"\b(?:Temporary Immigration Judges|Appellate Immigration Judges|For more information|EOIR is an office)", biography, maxsplit=1)[0].strip()
        # Some PDF pages break the next judge heading across glyph runs, so
        # the heading regex can miss it and merge multiple biographies. The
        # prose reliably repeats "<name> was appointed"; retain one profile.
        appointment_blocks = list(re.finditer(
            r"(?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'.-]*\s+){1,8}was appointed\b",
            biography,
        ))
        if len(appointment_blocks) > 1:
            biography = biography[:appointment_blocks[1].start()].strip()
        biography = re.sub(
            r"\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'. -]{2,100},\s+(?:(?:Temporary|Assistant Chief|Unit Chief|Regional Deputy Chief)\s+)?Immigration Judge,.*$",
            "",
            biography,
            flags=re.I,
        ).strip()
        if not biography or "appointed" not in biography.lower():
            continue
        name = clean(match.group(1))
        biography = re.sub(
            r"^(?:(?:(?:[A-Za-z.\u2013-]+\s+){0,8}Immigration Court)|Court|(?:(?:[A-Za-z.\u2013-]+\s+){0,8}Adjudication Center)|Center|Hearing Location)\s+",
            "",
            biography,
            flags=re.I,
        ).strip()
        if "appointed" not in biography.lower():
            continue
        biography = re.sub(
            r"\s+(?:—\s*EOIR\s*—|Office of Communications|Communications and Legislative Affairs Division|Executive Office for Immigration Review).*$",
            "",
            biography,
            flags=re.I,
        ).strip()
        biography_name = re.match(r"^([A-ZÀ-ÖØ-Þ].{2,90}?)\s+was appointed\b", biography, flags=re.I)
        if biography_name and len(clean(biography_name.group(1)).split()) <= 8:
            name = clean(biography_name.group(1))
        name = re.sub(r"\s*-\s*", "-", name)
        appointment = re.search(
            r"appointed.*?(?:begin hearing cases\s+)?(?:in|on)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+of)?\s+\d{4})",
            biography,
            flags=re.I,
        )
        education = next((sentence for sentence in re.split(r"(?<=[.!?])\s+", biography) if re.search(r"\b(?:earned|received)\b", sentence, re.I)), None)
        bar_start = re.search(r"\bJudge\s+[^.]{1,100}\s+is\s+(?:a\s+)?member\s+of\b", biography, re.I)
        if bar_start:
            for sentence_end in re.finditer(r"\.(?:\s+|$)", biography[bar_start.start():]):
                absolute_end = bar_start.start() + sentence_end.start() + 1
                prefix = biography[max(bar_start.start(), absolute_end - 5):absolute_end]
                if re.search(r"(?:U\.S|D\.C|N\.Y|Jr|Sr|St)\.$", prefix, re.I):
                    continue
                remainder = biography[absolute_end:].strip()
                if not remainder or len(remainder) <= 140:
                    biography = biography[:absolute_end].strip()
                    break
        bar_start = re.search(r"\bJudge\s+[^.]{1,100}\s+is\s+(?:a\s+)?member\s+of\b", biography, re.I)
        bar = biography[bar_start.start():].strip() if bar_start else None
        key = name_key(name)
        appointed_by = source.get("appointed_by")
        official_appointing_authority = re.match(r"^(.{1,100}?Attorney General[^.]{0,60}?)\s+appointed\b", biography, re.I)
        if not appointed_by and official_appointing_authority:
            appointed_by = clean(official_appointing_authority.group(1))
        candidate = {
            "judge_name": name,
            "name_key": key,
            "appointment_type": clean(match.group(2)),
            "appointment_court": clean(match.group(3)),
            "appointment_date": clean(appointment.group(1)) if appointment else None,
            "appointed_by": appointed_by,
            "education": education,
            "bar_membership": bar,
            "biography": biography,
            "source_title": source.get("title"),
            "source_url": source.get("url"),
            "source_date": source.get("source_date"),
            "employment_event": "appointment",
            "departure_status": None,
        }
        if key not in profiles or len(candidate["biography"]) > len(profiles[key]["biography"]):
            profiles[key] = candidate
    return list(profiles.values())


def parse_pdf(source, content):
    reader = PdfReader(io.BytesIO(content))
    texts = [
        "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages),
        "\n".join(page.extract_text() or "" for page in reader.pages),
    ]
    profiles = {}
    for text in texts:
        for profile in parse_text(source, text):
            key = profile["name_key"]
            if key not in profiles or len(profile["biography"]) > len(profiles[key]["biography"]):
                profiles[key] = profile
    return list(profiles.values())


def discover_doj_press_release_sources(config):
    if not config.get("discover_doj_press_releases"):
        return []
    response = requests.get(DOJ_NEWS_API, timeout=90, params={
        "parameters[title]": "Immigration Judges",
        "fields": "title,url,date,body",
        "pagesize": "50",
        "sort": "date",
        "direction": "ASC",
    }, headers={"User-Agent": "TRRB-AsylumJudge/1.0 (+https://asylumjudge.com)"})
    response.raise_for_status()
    sources = []
    for item in response.json().get("results", []):
        title = html.unescape(str(item.get("title") or ""))
        url = str(item.get("url") or "")
        body = str(item.get("body") or "")
        relevant_title = re.search(r"(?:EOIR|Executive Office for Immigration Review).*(?:Swears|Investiture|Immigration Judges)", title, re.I)
        if not relevant_title or "appointed" not in body.lower() or "immigration judge" not in body.lower():
            continue
        timestamp = int(item.get("date") or 0)
        sources.append({
            "title": title,
            "url": url,
            "source_date": datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat() if timestamp else None,
            "format": "html",
            "inline_html": body,
        })
    return sources


def main():
    config = json.loads(SOURCES.read_text(encoding="utf-8"))
    profiles = {}
    diagnostics = []
    discovered = discover_doj_press_release_sources(config)
    source_by_url = {source.get("url"): source for source in [*discovered, *config.get("sources", [])] if source.get("url")}
    sources = sorted(source_by_url.values(), key=lambda item: item.get("source_date") or "")
    for source in sources:
        if source.get("format") not in {"pdf", "html"} or not str(source.get("url", "")).startswith("https://www.justice.gov/"):
            continue
        if source.get("format") == "html" and source.get("inline_html"):
            parsed = parse_text(source, html_text(source["inline_html"]))
        elif LOCAL_PDF and source.get("format") == "pdf":
            content = Path(LOCAL_PDF).read_bytes()
            parsed = parse_pdf(source, content)
        else:
            response = requests.get(source["url"], timeout=90, headers={
                "User-Agent": "Mozilla/5.0 (compatible; TRRB-AsylumJudge/1.0; +https://asylumjudge.com)",
                "Accept": "application/pdf,text/html,application/octet-stream;q=0.9,*/*;q=0.8",
            })
            response.raise_for_status()
            content = response.content
            parsed = parse_pdf(source, content) if source.get("format") == "pdf" else parse_text(source, html_text(content.decode("utf-8", errors="replace")))
        diagnostics.append({"url": source["url"], "profiles": len(parsed)})
        for profile in parsed:
            profiles[profile["name_key"]] = profile

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_policy": "DOJ/EOIR first-party appointment biographies only; absence of a departure record is not proof of current employment",
        "profiles": sorted(profiles.values(), key=lambda item: item["judge_name"]),
        "diagnostics": diagnostics,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "profiles": len(output["profiles"]), "sources": diagnostics}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
