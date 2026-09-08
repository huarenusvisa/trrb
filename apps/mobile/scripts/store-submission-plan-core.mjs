import fs from 'node:fs';
import path from 'node:path';
import { readBuildEvidence } from './store-build-evidence-core.mjs';
import { readDistributionEvidence } from './store-distribution-evidence-core.mjs';
import { readDeviceAcceptance } from './store-device-acceptance-core.mjs';
import { inspectReleaseReadiness } from './store-release-preflight-core.mjs';

const CONFIRMED = '1';
const EXPECTED_STAGES = [
  'release-preflight',
  'production-builds',
  'internal-distribution',
  'real-device-acceptance',
  'store-review-submission'
];
const EXPECTED_ACCEPTANCE_CASES = [
  'guest-news-browsing',
  'unified-account-sign-in-and-sign-out',
  'community-post-comment-and-cleanup',
  'news-comment-reply-and-cleanup',
  'favorites-and-history-cloud-sync',
  'push-registration-delivery-and-deep-link',
  'account-deletion-entry-and-final-warning'
];

export function inspectSubmissionPlan({ mobileRoot, env = {}, expectedSourceCommit }) {
  const runbook = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/submission-runbook.json'), 'utf8'));
  const release = inspectReleaseReadiness({ mobileRoot, env });
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  const stages = runbook.stages ?? [];

  expect(runbook.schemaVersion === 1, 'Submission runbook schemaVersion must be 1');
  expect(runbook.policy?.automaticPublicRelease === false, 'Automatic public release must remain disabled');
  expect(runbook.policy?.productionBuildTrigger === 'manual-only', 'Production builds must remain manual-only');
  expect(runbook.policy?.androidFirstTrack === 'internal', 'First Android distribution must use the internal track');
  expect(runbook.policy?.androidFirstReleaseStatus === 'draft', 'First Android release must remain a draft');
  expect(JSON.stringify(stages.map(({ id }) => id)) === JSON.stringify(EXPECTED_STAGES), 'Submission stages are incomplete or out of order');

  const stageIds = new Set(stages.map(({ id }) => id));
  const confirmationIds = [];
  const confirmationVariables = [];
  stages.forEach((stage, index) => {
    expect((stage.dependsOn ?? []).every((id) => stageIds.has(id) && stages.findIndex((item) => item.id === id) < index), `${stage.id} has an invalid dependency`);
    for (const command of stage.commands ?? []) {
      expect(!/--auto-submit|--track\s+(?:production|beta|open)|releaseStatus[=:]\s*completed/i.test(command), `${stage.id} contains a public or automatic release command`);
      expect(!/[;&|`$]/.test(command), `${stage.id} command must remain a single auditable command`);
    }
    for (const confirmation of stage.confirmations ?? []) {
      confirmationIds.push(confirmation.id);
      confirmationVariables.push(confirmation.environmentVariable);
      expect(/^TRRB_[A-Z0-9_]+$/.test(confirmation.environmentVariable ?? ''), `${confirmation.id} has an invalid confirmation variable`);
    }
  });
  expect(new Set(confirmationIds).size === confirmationIds.length, 'Submission confirmation IDs must be unique');
  expect(new Set(confirmationVariables).size === confirmationVariables.length, 'Submission confirmation variables must be unique');
  expect(JSON.stringify(stages[3]?.acceptanceCases) === JSON.stringify(EXPECTED_ACCEPTANCE_CASES), 'Real-device acceptance coverage is incomplete');
  expect(stages[3]?.testContentPolicy === 'marked-test-content-only-and-clean-up-after-acceptance', 'Acceptance must protect real user content');
  expect(stages[4]?.manualOnly === true && (stages[4]?.commands ?? []).length === 0, 'Store review submission must remain an explicit manual console action');
  const buildEvidence = stages[1]?.evidence;
  expect(buildEvidence?.environmentVariable === 'TRRB_STORE_BUILD_EVIDENCE_FILE', 'Production builds must require a local evidence file');
  expect(buildEvidence?.command === 'npm run store:build-evidence-check -- store/build-evidence.local.json', 'Production build evidence command is missing or unsafe');
  expect(!/[;&|`$]/.test(buildEvidence?.command ?? ''), 'Production build evidence command must remain a single auditable command');
  const distributionEvidence = stages[2]?.evidence;
  expect(distributionEvidence?.environmentVariable === 'TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE', 'Internal distribution must require a local evidence file');
  expect(distributionEvidence?.buildEvidenceEnvironmentVariable === 'TRRB_STORE_BUILD_EVIDENCE_FILE', 'Internal distribution must reference the validated build evidence');
  expect(distributionEvidence?.command === 'npm run store:distribution-evidence-check -- store/distribution-evidence.local.json store/build-evidence.local.json', 'Internal distribution evidence command is missing or unsafe');
  expect(!/[;&|`$]/.test(distributionEvidence?.command ?? ''), 'Internal distribution evidence command must remain a single auditable command');
  const deviceEvidence = stages[3]?.evidence;
  expect(deviceEvidence?.environmentVariable === 'TRRB_STORE_DEVICE_ACCEPTANCE_FILE', 'Real-device acceptance must require a local evidence file');
  expect(deviceEvidence?.distributionEvidenceEnvironmentVariable === 'TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE', 'Real-device acceptance must reference validated distribution evidence');
  expect(deviceEvidence?.buildEvidenceEnvironmentVariable === 'TRRB_STORE_BUILD_EVIDENCE_FILE', 'Real-device acceptance must reference validated build evidence');
  expect(deviceEvidence?.command === 'npm run store:device-acceptance-check -- store/device-acceptance.local.json store/distribution-evidence.local.json store/build-evidence.local.json', 'Real-device acceptance evidence command is missing or unsafe');
  expect(!/[;&|`$]/.test(deviceEvidence?.command ?? ''), 'Real-device acceptance evidence command must remain a single auditable command');

  const state = stages.map((stage) => {
    let missing = stage.id === 'release-preflight'
      ? release.missing.map(({ id, label, confirmationEnvironmentVariable }) => ({ id, label, environmentVariable: confirmationEnvironmentVariable }))
      : (stage.confirmations ?? []).filter(({ environmentVariable }) => env[environmentVariable] !== CONFIRMED);
    const commands = [...(stage.commands ?? [])];
    if (stage.id === 'production-builds') {
      const evidencePath = env[buildEvidence?.environmentVariable];
      const evidence = evidencePath ? readBuildEvidence({ mobileRoot, evidencePath, expectedSourceCommit }) : { valid: false };
      if (!evidence.valid) {
        missing = [...missing, {
          id: 'production-build-evidence',
          label: buildEvidence?.label,
          environmentVariable: buildEvidence?.environmentVariable
        }];
      }
      if (buildEvidence?.command) commands.push(buildEvidence.command);
    }
    if (stage.id === 'internal-distribution') {
      const evidencePath = env[distributionEvidence?.environmentVariable];
      const buildEvidencePath = env[distributionEvidence?.buildEvidenceEnvironmentVariable];
      const evidence = evidencePath && buildEvidencePath
        ? readDistributionEvidence({ mobileRoot, evidencePath, buildEvidencePath, expectedSourceCommit })
        : { valid: false };
      if (!evidence.valid) {
        missing = [...missing, {
          id: 'internal-distribution-evidence',
          label: distributionEvidence?.label,
          environmentVariable: distributionEvidence?.environmentVariable
        }];
      }
      if (distributionEvidence?.command) commands.push(distributionEvidence.command);
    }
    if (stage.id === 'real-device-acceptance') {
      const evidencePath = env[deviceEvidence?.environmentVariable];
      const distributionEvidencePath = env[deviceEvidence?.distributionEvidenceEnvironmentVariable];
      const buildEvidencePath = env[deviceEvidence?.buildEvidenceEnvironmentVariable];
      const evidence = evidencePath && distributionEvidencePath && buildEvidencePath
        ? readDeviceAcceptance({ mobileRoot, evidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit })
        : { valid: false };
      if (!evidence.valid) {
        missing = [...missing, {
          id: 'real-device-acceptance-evidence',
          label: deviceEvidence?.label,
          environmentVariable: deviceEvidence?.environmentVariable
        }];
      }
      if (deviceEvidence?.command) commands.push(deviceEvidence.command);
    }
    return { id: stage.id, title: stage.title, complete: missing.length === 0, missing, commands };
  });
  const nextStage = state.find((stage) => !stage.complete) ?? null;

  return {
    valid: failures.length === 0 && release.codeReady,
    failures: [...release.failures, ...failures],
    complete: nextStage == null,
    nextStage,
    stages: state
  };
}
