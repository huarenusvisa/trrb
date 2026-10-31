// Only a complete, forward comparison of workflow-only changes can explain
// an intentionally unchanged production SHA. Unknown differences stay alerts.
const DEPLOY_WORKFLOWS = new Set([
  '.github/workflows/round16-node9-production-deploy-recovery.yml',
  '.github/workflows/seo-search-engine-ops.yml',
]);
export function isWorkflowOnlyDifference(compare, liveSha) {
  const files = compare?.files;
  return compare?.status === 'ahead'
    && compare?.merge_base_commit?.sha === liveSha
    && Array.isArray(files) && files.length > 0 && files.length < 300
    && files.every(file => [file.filename, file.previous_filename].filter(Boolean).every(path =>
      path.startsWith('.github/workflows/') && !DEPLOY_WORKFLOWS.has(path)));
}
