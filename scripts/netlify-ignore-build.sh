#!/usr/bin/env bash

set -euo pipefail

base_ref="${CACHED_COMMIT_REF:-}"
head_ref="${COMMIT_REF:-}"

# If Netlify cannot provide two valid commits, build instead of risking a
# skipped first deploy or an incomplete shallow-clone comparison.
if [[ -z "$base_ref" || -z "$head_ref" ]] \
  || ! git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1 \
  || ! git rev-parse --verify "${head_ref}^{commit}" >/dev/null 2>&1; then
  echo "Netlify refs unavailable; running the build."
  exit 1
fi

pathspecs=(
  "."
  ":(exclude).github/**"
  ":(exclude)reports/**"
  ":(exclude)scripts/validate-mobile-build-cost-control.test.mjs"
  ":(exclude)apps/mobile/**"
)

# Mobile-only changes are delivered and validated through the App CI/EAS
# pipeline. They do not change the Netlify website, so skip both production
# builds and deploy previews when apps/mobile/** is the only changed area.
# Any web, SEO, Netlify, function, edge-function, or shared-site change still
# remains in the diff and therefore keeps the normal Netlify build/preview.
if git diff --quiet "$base_ref" "$head_ref" -- "${pathspecs[@]}"; then
  echo "No Netlify site changes detected for ${CONTEXT:-unknown}; skipping build."
  exit 0
fi

echo "Netlify site changes detected for ${CONTEXT:-unknown}; running build."
exit 1
