// Only a complete, forward comparison of workflow-only changes can explain
// an intentionally unchanged production SHA. Unknown differences stay alerts.
const DEPLOY_WORKFLOWS = new Set([
  '.github/workflows/round16-node9-production-deploy-recovery.yml',
  '.github/workflows/seo-search-engine-ops.yml',
]);
// The audit report is published with the repository, but a timestamp-only
// refresh does not change the application, its data, or its runtime assets.
// Never suppress substantive audit changes or arbitrary JSON file changes.
const NON_RUNTIME_AUDIT = 'round16-node3-ai-incremental-grounding-audit.json';
function isTimestampOnlyAudit(file) {
  if (file.filename !== NON_RUNTIME_AUDIT || file.previous_filename
    || file.status !== 'modified' || file.additions !== 1 || file.deletions !== 1
    || file.changes !== 2 || typeof file.patch !== 'string') return false;
  const lines = file.patch.split(/\r?\n/).filter(line => /^[+-](?![+-])/.test(line));
  return lines.length === 2 && lines[0][0] !== lines[1][0]
    && lines.every(line => /^[+-]\s*"generatedAt":\s*"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z",?\s*$/.test(line));
}
export function isWorkflowOnlyDifference(compare, liveSha) {
  const files = compare?.files;
  return compare?.status === 'ahead'
    && compare?.merge_base_commit?.sha === liveSha
    && Array.isArray(files) && files.length > 0 && files.length < 300
    && files.every(file => isTimestampOnlyAudit(file) ||
      [file.filename, file.previous_filename].filter(Boolean).every(path =>
        path.startsWith('.github/workflows/') && !DEPLOY_WORKFLOWS.has(path)));
}
