#!/usr/bin/env python3
"""Collect official EOIR internet-based hearing links and telephone codes."""

import html
import json
import os
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests


SOURCE_URL = "https://www.justice.gov/eoir/find-immigration-court-and-access-internet-based-hearings"
OUTPUT = Path(os.environ.get("EOIR_WEBEX_OUTPUT", "data/eoir-webex-links.json"))
LOCAL_HTML = os.environ.get("EOIR_WEBEX_HTML_PATH")


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(value or "").replace("\u200b", " ")).strip()


def clean_judge_name(value):
    value = clean(value).replace("Karen.", "Karen ")
    value = re.sub(r"^(?:ACIJ|IJ)\s+", "", value, flags=re.I)
    value = re.sub(r"\s*\([A-Z0-9]{2,4}\)\s*$", "", value).strip()
    return value


def name_key(name):
    name = unicodedata.normalize("NFKD", clean_judge_name(name))
    name = "".join(char for char in name if not unicodedata.combining(char))
    name = re.sub(r"\b(?:Jr\.?|Sr\.?|II|III|IV)\b", "", name, flags=re.I)
    parts = re.findall(r"[A-Za-z'-]+", name.lower())
    return f"{parts[-1]}|{parts[0]}" if len(parts) > 1 else "".join(parts)


class HearingTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_court = ""
        self.in_h3 = False
        self.h3_text = []
        self.in_tr = False
        self.in_td = False
        self.td_text = []
        self.cells = []
        self.cell_links = []
        self.rows = []
        self.visible_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h3":
            self.in_h3 = True
            self.h3_text = []
        elif tag == "tr":
            self.in_tr = True
            self.cells = []
            self.cell_links = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.td_text = []
            self.cell_links.append([])
        elif tag == "a" and self.in_td and attrs.get("href"):
            self.cell_links[-1].append(attrs["href"])

    def handle_data(self, data):
        self.visible_text.append(data)
        if self.in_h3:
            self.h3_text.append(data)
        if self.in_td:
            self.td_text.append(data)

    def handle_endtag(self, tag):
        if tag == "h3":
            self.current_court = clean(" ".join(self.h3_text))
            self.in_h3 = False
        elif tag == "td" and self.in_td:
            self.cells.append(clean(" ".join(self.td_text)))
            self.in_td = False
        elif tag == "tr" and self.in_tr:
            self.in_tr = False
            if len(self.cells) < 3:
                return
            webex = next((href for links in self.cell_links for href in links if "eoir.webex.com/meet/" in href.lower()), None)
            if not webex:
                return
            if webex.startswith("//"):
                webex = f"https:{webex}"
            elif webex.startswith("/"):
                webex = urljoin(SOURCE_URL, webex)
            webex = re.sub(r"^http://", "https://", webex, flags=re.I)
            self.rows.append({
                "judge_name": clean_judge_name(self.cells[0]),
                "court_name": self.current_court,
                "webex_url": webex.strip(),
                "access_code": re.sub(r"\s+", " ", self.cells[2]).strip(),
            })


def main():
    if LOCAL_HTML:
        content = Path(LOCAL_HTML).read_text(encoding="utf-8", errors="replace")
    else:
        response = requests.get(SOURCE_URL, timeout=90, headers={
            "User-Agent": "Mozilla/5.0 (compatible; TRRB-AsylumJudge/1.0; +https://asylumjudge.com)",
            "Accept": "text/html,application/xhtml+xml",
        })
        response.raise_for_status()
        content = response.text

    parser = HearingTableParser()
    parser.feed(content)
    grouped = defaultdict(list)
    display_names = {}
    for row in parser.rows:
        key = name_key(row["judge_name"])
        if not key:
            continue
        link = {name: row[name] for name in ("court_name", "webex_url", "access_code")}
        if link not in grouped[key]:
            grouped[key].append(link)
        display_names.setdefault(key, row["judge_name"])

    visible = clean(" ".join(parser.visible_text))
    updated = re.search(r"Updated\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})", visible)
    profiles = [{
        "judge_name": display_names[key],
        "name_key": key,
        "links": links,
    } for key, links in grouped.items()]
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE_URL,
        "source_updated_at": updated.group(1) if updated else None,
        "telephonic_number": "1-415-527-5035",
        "notice": "Confirm the hearing medium in the official case notice or with the immigration court; unrepresented respondents default to in-person.",
        "profiles": sorted(profiles, key=lambda item: item["judge_name"]),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "profiles": len(profiles), "links": sum(len(item["links"]) for item in profiles), "source_updated_at": output["source_updated_at"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
