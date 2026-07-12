import { fetchIceCandidates } from "./ice-fetch.mjs";
import { publishIceCandidates } from "./ice-publish.mjs";
import { buildIceDashboard } from "./ice-build-dashboard.mjs";

async function main() {
  const fetched = await fetchIceCandidates();
  const published = await publishIceCandidates();
  const dashboard = await buildIceDashboard();

  console.log(JSON.stringify({
    ok: true,
    fetched: fetched.candidates.length,
    published,
    total_published: dashboard.total_published
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
