#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function validSha(value) {
  const sha = String(value || '').trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : '';
}

// Some Netlify build-hook contexts can expose a non-SHA COMMIT_REF. Never let
// that mask the valid checked-out git SHA. Choose the first actual 40-hex SHA.
const sha = [
  process.env.COMMIT_REF,
  gitSha(),
  process.env.GITHUB_SHA
].map(validSha).find(Boolean) || '';

if (!sha) {
  if (process.env.NETLIFY === 'true') {
    // Deployment must not be blocked solely because version metadata is absent.
    // Production acceptance will still reject an unknown live SHA.
    writeFileSync('deploy-version.txt', 'unknown\n');
    console.warn('[deploy-version] no valid git SHA resolved in Netlify; wrote unknown without blocking deploy');
    process.exit(0);
  }
  throw new Error('Unable to resolve deploy git SHA');
}

writeFileSync('deploy-version.txt', `${sha}\n`);
console.log(`[deploy-version] ${sha}`);
