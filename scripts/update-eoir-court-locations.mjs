import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'data', 'eoir-court-locations.json');
const statusUrl = 'https://www.justice.gov/eoir/immigration-court-operational-status';
const codesUrl = 'https://www.justice.gov/eoir/policy-manual-eoir/part-VII/appendices/n';

const titleOverrides = {
  ATD: 'Atlanta – Ted Turner Drive',
  ATL: 'Atlanta - W. Peachtree Street',
  EPD: 'El Paso SPC',
  FCI: 'Falls Church Immigration Adjudication Center',
  FTW: 'Fort Worth Immigration Adjudication Center',
  HGP: 'Houston – Greenspoint Park',
  HOU: 'Houston - Jefferson Street Immigration Court',
  HSG: 'Houston – S. Gessner Road',
  KRO: 'Miami Krome (Detained)',
  NLA: 'Los Angeles – N. Los Angeles Street',
  NYV: 'New York - Varick',
  RIC: 'Richmond Immigration Adjudication Center',
  SAJ: 'Guaynabo (San Juan)',
  SDC: 'Stewart',
  VNS: 'Los Angeles - Van Nuys Boulevard',
  WLA: 'Los Angeles – West Los Angeles'
};

// Retired EOIR codes that remain in historical decision data.
const legacyAliases = {
  LOW: 'CHE',
  PIS: 'PEP',
  POO: 'POR',
  WAS: 'ANN'
};

const legacyWithoutCurrentLocation = {
  AGA: 'Hagatna',
  SFR: 'San Francisco'
};

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');
}

function stripHtml(value = '') {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function normalizeTitle(value = '') {
  return stripHtml(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bimmigration court\b/g, '')
    .replace(/\bdetained\b/g, '')
    .replace(/\bstreet\b/g, 'st')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'AsylumJudge court address updater (official EOIR public data)' }
  });
  if (!response.ok) throw new Error(`EOIR request failed (${response.status}): ${url}`);
  return response.text();
}

function parseCourtCodes(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) {
    const code = stripHtml(match[1]);
    const name = stripHtml(match[2]);
    if (/^[A-Z]{3}$/.test(code) && name) rows.push({ code, name });
  }
  if (rows.length < 60) throw new Error(`EOIR court-code table is incomplete (${rows.length} rows)`);
  return rows;
}

function parseOperationalLocations(html) {
  const settingsMatch = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/i);
  if (!settingsMatch) throw new Error('EOIR operational-status map settings were not found');
  const settings = JSON.parse(decodeHtml(settingsMatch[1]));
  const features = Object.values(settings.leaflet || {}).flatMap((map) => map.features || []);
  const locations = features.map((feature) => {
    const popup = feature.popup?.value || '';
    const linkMatch = popup.match(/<a href="([^"]*)">([\s\S]*?)<\/a>/i);
    const addressMatch = popup.match(/<p class="address"[\s\S]*?<\/p>/i);
    const statusParts = popup.match(/<p(?! class="address")[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const status = statusParts
      .map(stripHtml)
      .map((part) => part.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').trim())
      .filter((part) => /[A-Za-z]/.test(part))
      .join(' · ');
    return {
      name: stripHtml(linkMatch?.[2] || feature.tooltip?.value || ''),
      address: stripHtml(addressMatch?.[0] || ''),
      status: status || 'Status not published',
      official_url: linkMatch?.[1] || statusUrl,
      latitude: Number(feature.lat),
      longitude: Number(feature.lon)
    };
  }).filter((row) => row.name && row.address);
  if (locations.length < 60) throw new Error(`EOIR operational-status directory is incomplete (${locations.length} locations)`);
  return locations;
}

function chooseLocation(code, codeName, locations) {
  const expected = titleOverrides[code] || codeName;
  const exact = locations.find((row) => normalizeTitle(row.name) === normalizeTitle(expected));
  if (exact) return exact;
  const target = normalizeTitle(expected);
  const partial = locations.filter((row) => {
    const candidate = normalizeTitle(row.name);
    return candidate.includes(target) || target.includes(candidate);
  });
  return partial.length === 1 ? partial[0] : null;
}

const [statusHtml, codesHtml] = await Promise.all([fetchText(statusUrl), fetchText(codesUrl)]);
const locations = parseOperationalLocations(statusHtml);
const codeRows = parseCourtCodes(codesHtml);
if (codeRows.length < 60) throw new Error(`EOIR court-code directory is incomplete (${codeRows.length} codes)`);
const courts = {};

for (const { code, name } of codeRows) {
  const location = chooseLocation(code, name, locations);
  courts[code] = {
    code,
    official_name: name,
    current_location_status: location ? 'listed' : 'not_listed',
    locations: location ? [location] : []
  };
}

for (const [legacyCode, currentCode] of Object.entries(legacyAliases)) {
  courts[legacyCode] = {
    code: legacyCode,
    official_name: courts[currentCode]?.official_name || legacyCode,
    current_location_status: courts[currentCode]?.locations?.length ? 'legacy_alias' : 'not_listed',
    successor_code: currentCode,
    locations: courts[currentCode]?.locations || []
  };
}

for (const [code, name] of Object.entries(legacyWithoutCurrentLocation)) {
  courts[code] = {
    code,
    official_name: name,
    current_location_status: 'not_listed',
    locations: []
  };
}

const payload = {
  generated_at: new Date().toISOString(),
  source_url: statusUrl,
  court_code_source_url: codesUrl,
  source_notice: 'Addresses and operational statuses are a snapshot of the official DOJ/EOIR public directory. Hearing notices remain controlling.',
  location_count: locations.length,
  courts
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${Object.keys(courts).length} court-code records and ${locations.length} official locations to ${outputPath}`);
