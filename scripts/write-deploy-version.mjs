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

// Netlify linked-repo builds expose COMMIT_REF. Direct CLI deploys from GitHub
// Actions use the checked-out repository SHA. Prefer the actual build checkout
// rather than the workflow's original GITHUB_SHA because Node9 may reset to a
// newer main commit after its debounce window.
const sha = String(process.env.COMMIT_REF || gitSha() || process.env.GITHUB_SHA || '').trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) {
  throw new Error(`Unable to resolve deploy git SHA: ${sha || 'empty'}`);
}

const payload = `${sha}\n`;
writeFileSync('deploy-version.txt', payload);
console.log(`[deploy-version] ${sha}`);
