# Jobs geographic audit — 2026-10-02

Scope: all active public US job locations, homepage search, /jobs list/map, and both ICE map coordinate validators.

- Census 2026 places, municipalities/towns, counties, states and ZCTAs; USGS GNIS community centers.
- 48,014 directory records, 50 states + DC + Puerto Rico, 33,791 ZCTA centers.
- 1,289 active location names reviewed; 1,260 unambiguous centers matched. Unsupported or ambiguous names remain list-only, never silently assigned a guessed address.
- Massachusetts: 287 valid/actionable listings, 73 specific place names; all specific place names matched. Statewide unspecified records remain unlocated.
- 23 Massachusetts title/category mismatches corrected in the shared public query (CNA/HHA/nursing included). Ingestion now uses the same nursing precedence and rejects foreign state codes.
- State-qualified city values prevent Wilmington MA/DE and other namesakes from mixing. City aliases compare city/borough/neighborhood/county as alternatives.
- ZIP uses the official ZCTA center and a disclosed approximate nearby radius. Exact business address coordinates take precedence if supplied.
- Nearby expansion only happens on an empty first page; subsequent pages preserve scope. Map and list share the same public/actionable rows.
- Both ICE coordinate validators reject null, blank, nonfinite and out-of-range coordinates.

Sources: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html ; https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/3

Rebuild: download Census 2026 national place/cousubs/counties/state/zcta ZIPs as places.zip/towns.zip/counties.zip/states.zip/zips.zip, query GNIS populated places for current job place names into gnis-job-places.json, then run `python scripts/build-job-geography.py <source-directory>`.

## Places intentionally left without a guessed map pin

These remain searchable in the list. Some are regions, shopping districts, multiple locations, ambiguous townships, or malformed source labels; they require a more specific employer address.

| State | Location | Listings |
|---|---|---:|
| NY | Long Island | 141 |
| PA | Cranberry Township | 6 |
| WA | Totem Lake | 4 |
| CA | La Cienega | 3 |
| CT | Fairfield County | 3 |
| AZ | Happy Valley | 2 |
| CA | La Jolla | 2 |
| CA | Mission Valley | 2 |
| CA | Strawberry Village | 2 |
| CA | Valencia | 2 |
| PA | Brookline | 2 |
| VT | St Albans Bay | 2 |
| CA | Buford | 1 |
| CA | Point Loma | 1 |
| CA | Wilshire | 1 |
| CT | Darien and New Canaan | 1 |
| FL | Parrish | 1 |
| HI | Hawaii Island | 1 |
| KY | Northern Kentucky | 1 |
| MD | Graceland Park | 1 |
| MO | 密苏里州（具体城市电询） | 1 |
| NY | Columbia University area | 1 |
| NY | Coney Island | 1 |
| NY | Multiple NYC locations | 1 |
| NY | Sunset Park | 1 |
| OH | Easton | 1 |
| OH | Liberty Township | 1 |
| SC | Daniel Island | 1 |
| VA | Chesterfield | 1 |
| WA | Capital Hill | 1 |
| WA | South Lake Union | 1 |
