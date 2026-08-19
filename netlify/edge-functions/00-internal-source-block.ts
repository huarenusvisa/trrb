const BLOCKED_PREFIXES = [
  "/.github/",
  "/.git/",
  "/scripts/",
  "/netlify/",
  "/docs/",
  "/reports/",
  "/migrations/",
  "/supabase/",
  "/tests/",
  "/test/"
];

// Root-level repository artifacts are part of the Git working tree but are not
// public website assets. The site currently publishes from repository root, so
// deny them before any generic rewrite/static-file responder can expose them.
const ROOT_BLOCK_PATTERNS = [
  /^\/(?:README|CHANGELOG|CONTRIBUTING|LICENSE(?:\.|$))/i,
  /^\/SUPABASE[-_].*\.sql$/i,
  /^\/.*\.sql$/i,
  /^\/(?:FIX|TEST|MOBILE|UPLOAD)[-_].*\.txt$/i,
  /^\/round\d+[-_].*\.(?:json|txt|md)$/i,
  /^\/.*(?:audit|diagnostic|report).*\.json$/i,
  /^\/.*(?:audit|diagnostic|report).*\.txt$/i,
  /^\/package(?:-lock)?\.json$/i,
  /^\/tsconfig(?:\.[^/]+)?\.json$/i,
  /^\/deno\.jsonc?$/i,
  /^\/\.env(?:\..*)?$/i,
  /^\/netlify\.toml$/i
];

// These root TXT files are intentionally public verification/deployment files.
// Search-engine verification tokens are random hexadecimal filenames; deploy
// version is used by the exact-SHA production guard.
function isAllowedPublicTxt(pathname: string): boolean {
  return pathname === "/deploy-version.txt" || /^\/[a-f0-9]{24,64}\.txt$/i.test(pathname);
}

function shouldBlock(pathname: string): boolean {
  if (isAllowedPublicTxt(pathname)) return false;
  const lower = pathname.toLowerCase();
  if (BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix.toLowerCase()))) return true;
  return ROOT_BLOCK_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const config = { path: "/*" };

export default async (request: Request, context: any) => {
  const pathname = new URL(request.url).pathname;
  if (!shouldBlock(pathname)) return context.next();
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-trrb-internal-source-block": "repository-root-v2"
    }
  });
};
