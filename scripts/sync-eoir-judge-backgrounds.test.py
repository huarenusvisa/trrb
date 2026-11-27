#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-eoir-judge-backgrounds.py")
SPEC = importlib.util.spec_from_file_location("sync_eoir_judge_backgrounds", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


SOURCE = {
    "title": "EOIR official biographies",
    "url": "https://www.justice.gov/eoir/media/example/dl?inline=",
    "source_date": "2026-11-19",
}


class EoirBiographyParserTest(unittest.TestCase):
    def test_rejoins_wrapped_immigration_court_heading(self):
        raw = """Elizabeth D. Anderson, Temporary Immigration Judge, Los Angeles - West Los
Angeles Immigration Court
Elizabeth D. Anderson was appointed as a temporary immigration judge to begin hearing cases in November 2026. Judge Anderson is a member of the Virginia State Bar.
"""
        profiles = MODULE.parse_text(SOURCE, raw)
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["judge_name"], "Elizabeth D. Anderson")
        self.assertEqual(profiles[0]["appointment_court"], "Los Angeles - West Los Angeles Immigration Court")

    def test_rejoins_wrapped_adjudication_center_heading(self):
        raw = """Elena Buruncenco, Immigration Judge, Falls Church Immigration
Adjudication Center
Elena Buruncenco was appointed as an immigration judge to begin hearing cases in November 2026. Judge Buruncenco is a member of the Florida Bar.
"""
        profiles = MODULE.parse_text(SOURCE, raw)
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["appointment_court"], "Falls Church Immigration Adjudication Center")

    def test_normalizes_layout_glyph_split_in_name_and_court(self):
        raw = """Elena B uruncenco, Immigration Judge, F alls C hurch I mmigration Court
Elena B uruncenco was appointed as an immigration judge to begin hearing cases in November 2026. Judge Buruncenco is a member of the Florida Bar.
"""
        profiles = MODULE.parse_text(SOURCE, raw)
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["judge_name"], "Elena Buruncenco")
        self.assertEqual(profiles[0]["name_key"], "buruncenco|elena")
        self.assertEqual(profiles[0]["appointment_court"], "Falls Church Immigration Court")


if __name__ == "__main__":
    unittest.main()
