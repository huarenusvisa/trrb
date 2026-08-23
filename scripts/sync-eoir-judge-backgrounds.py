#!/usr/bin/env python3
"""Collect verified immigration-judge appointment biographies from DOJ/EOIR."""

import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from pypdf import PdfReader


SOURCES = Path(os.environ.get("EOIR_BIO_SOURCES", "data/immigration-judge-biography-sources.json"))
OUTPUT = Path(os.environ.get("EOIR_BIO_OUTPUT", "data/immigration-judge-backgrounds.json"))
LOCAL_PDF = os.environ.get("EOIR_BIO_PDF_PATH")


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


def parse_pdf(source, content):
    reader = PdfReader(io.BytesIO(content))
    texts = [
        "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages),
        "\n".join(page.extract_text() or "" for page in reader.pages),
    ]
    heading = re.compile(
        r"(?m)^\s*([A-ZÀ-ÖØ-Þ][^\n,]{2,90}),\s+((?:Temporary\s+)?Immigration Judge),?\s+([^\n]{2,180})\s*$"
    )
    profiles = {}
    for raw_text in texts:
        text = raw_text.replace("\u00a0", " ").replace("\u2019", "'")
        matches = list(heading.finditer(text))
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            biography = clean(text[match.end():end])
            biography = re.split(r"\b(?:Temporary Immigration Judges|For more information|EOIR is an office)", biography, maxsplit=1)[0].strip()
            # Some PDF pages break the next judge heading across glyph runs, so
            # the heading regex can miss it and merge multiple biographies.
            # The prose itself reliably repeats "<name> was appointed". Keep
            # exactly the first appointment biography and discard any later
            # appointment block before publishing a profile.
            appointment_blocks = list(re.finditer(
                r"(?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'.-]*\s+){1,8}was appointed\b",
                biography,
            ))
            if len(appointment_blocks) > 1:
                biography = biography[:appointment_blocks[1].start()].strip()
            biography = re.sub(
                r"\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'. -]{2,100},\s+(?:Temporary\s+)?Immigration Judge,.*$",
                "",
                biography,
            ).strip()
            if not biography or "appointed" not in biography.lower():
                continue
            appointment = re.search(
                r"appointed.*?(?:begin hearing cases\s+)?(?:in|on)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+of)?\s+\d{4})",
                biography,
                flags=re.I,
            )
            education = next((sentence for sentence in re.split(r"(?<=[.!?])\s+", biography) if re.search(r"\b(?:earned|received)\b", sentence, re.I)), None)
            bar_start = re.search(r"\bJudge\s+[^.]{1,100}\s+is\s+(?:a\s+)?member\s+of\b", biography, re.I)
            bar = biography[bar_start.start():].strip() if bar_start else None
            name = clean(match.group(1))
            biography_name = re.match(r"^(?:Immigration Court\s+)?([A-ZÀ-ÖØ-Þ].{2,90}?)\s+was appointed\b", biography, flags=re.I)
            if biography_name and len(clean(biography_name.group(1)).split()) <= 8:
                name = clean(biography_name.group(1))
            key = name_key(name)
            candidate = {
                "judge_name": name,
                "name_key": key,
                "appointment_type": clean(match.group(2)),
                "appointment_court": clean(match.group(3)),
                "appointment_date": clean(appointment.group(1)) if appointment else None,
                "appointed_by": source.get("appointed_by"),
                "education": education,
                "bar_membership": bar,
                "biography": biography,
                "source_title": source.get("title"),
                "source_url": source.get("url"),
                "source_date": source.get("source_date"),
                "employment_event": "appointment",
                "departure_status": None,
            }
            # Layout extraction normally preserves the cleanest biography. The
            # plain-text pass fills headings/pages where PDF letter positioning
            # breaks words apart (four profiles in the May 2026 release).
            if key not in profiles or len(candidate["biography"]) > len(profiles[key]["biography"]):
                profiles[key] = candidate
    return list(profiles.values())


def main():
    config = json.loads(SOURCES.read_text(encoding="utf-8"))
    profiles = {}
    diagnostics = []
    for source in config.get("sources", []):
        if source.get("format") != "pdf" or not str(source.get("url", "")).startswith("https://www.justice.gov/"):
            continue
        if LOCAL_PDF:
            content = Path(LOCAL_PDF).read_bytes()
        else:
            response = requests.get(source["url"], timeout=90, headers={
                "User-Agent": "Mozilla/5.0 (compatible; TRRB-AsylumJudge/1.0; +https://asylumjudge.com)",
                "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
            })
            response.raise_for_status()
            content = response.content
        parsed = parse_pdf(source, content)
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
