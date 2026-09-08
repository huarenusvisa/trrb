import fs from 'node:fs';
import path from 'node:path';
import { readBuildEvidence } from './store-build-evidence-core.mjs';
import { readDistributionEvidence } from './store-distribution-evidence-core.mjs';
import { readDeviceAcceptance } from './store-device-acceptance-core.mjs';
import { readReviewSubmission } from './store-review-submission-core.mjs';
import { readScreenshotEvidence } from './store-screenshot-evidence-core.mjs';
import { readReleaseCandidate } from './store-release-candidate-core.mjs';
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
  const screenshotEvidence = stages[0]?.evidence;
  expect(screenshotEvidence?.environmentVariable === 'TRRB_STORE_SCREENSHOT_EVIDENCE_FILE', 'Release preflight must require a local screenshot evidence file');
  expect(screenshotEvidence?.command === 'npm run store:screenshot-evidence-check -- store/screenshot-evidence.local.json', 'Screenshot evidence command is missing or unsafe');
  expect(!/[;&|`$]/.test(screenshotEvidence?.command ?? ''), 'Screenshot evidence command must remain a single auditable command');
  const candidateEvidence = stages[0]?.candidateEvidence;
  expect(candidateEvidence?.environmentVariable === 'TRRB_STORE_RELEASE_CANDIDATE_FILE', 'Release preflight must require a frozen candidate file');
  expect(candidateEvidence?.screenshotEvidenceEnvironmentVariable === 'TRRB_STORE_SCREENSHOT_EVIDENCE_FILE', 'Release candidate must reference the validated screenshot evidence');
  expect(candidateEvidence?.command === 'npm run store:release-candidate-check -- store/release-candidate.local.json store/screenshot-evidence.local.json', 'Release candidate command is missing or unsafe');
  expect(!/[;&|`$]/.test(candidateEvidence?.command ?? ''), 'Release candidate command must remain a single auditable command');
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
  const reviewEvidence = stages[4]?.evidence;
  expect(reviewEvidence?.environmentVariable === 'TRRB_STORE_REVIEW_SUBMISSION_FILE', 'Store review submission must require a local evidence file');
  expect(reviewEvidence?.deviceEvidenceEnvironmentVariable === 'TRRB_STORE_DEVICE_ACCEPTANCE_FILE', 'Store review submission must reference validated device acceptance');
  expect(reviewEvidence?.distributionEvidenceEnvironmentVariable === 'TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE', 'Store review submission must reference validated distribution evidence');
  expect(reviewEvidence?.buildEvidenceEnvironmentVariable === 'TRRB_STORE_BUILD_EVIDENCE_FILE', 'Store review submission must reference validated build evidence');
  expect(reviewEvidence?.command === 'npm run store:review-submission-check -- store/review-submission.local.json store/device-acceptance.local.json store/distribution-evidence.local.json store/build-evidence.local.json', 'Store review submission evidence command is missing or unsafe');
  expect(!/[;&|`$]/.test(reviewEvidence?.command ?? ''), 'Store review submission evidence command must remain a single auditable command');

  const state = stages.map((stage) => {
    let missing = stage.id === 'release-preflight'
      ? release.missing.map(({ id, label, confirmationEnvironmentVariable }) => ({ id, label, environmentVariable: confirmationEnvironmentVariable }))
      : (stage.confirmations ?? []).filter(({ environmentVariable }) => env[environmentVariable] !== CONFIRMED);
    const commands = [...(stage.commands ?? [])];
    if (stage.id === 'release-preflight') {
      const evidencePath = env[screenshotEvidence?.environmentVariable];
      const evidence = evidencePath
        ? readScreenshotEvidence({ mobileRoot, evidencePath, expectedSourceCommit, verifyFiles: false })
        : { valid: false };
      if (!evidence.valid) {
        missing = [...missing, {
          id: 'store-screenshot-evidence',
          label: screenshotEvidence?.label,
          environmentVariable: screenshotEvidence?.environmentVariable
        }];
      }
      if (screenshotEvidence?.command) commands.push(screenshotEvidence.command);
      const candidatePath = env[candidateEvidence?.environmentVariable];
      const candidateScreenshotPath = env[candidateEvidence?.screenshotEvidenceEnvironmentVariable];
      const candidate = candidatePath && candidateScreenshotPath
        ? readReleaseCandidate({
            mobileRoot, candidatePath, screenshotEvidencePath: candidateScreenshotPath,
            expectedSourceCommit, verifyFiles: false
          })
        : { valid: false };
      if (!candidate.valid) {
        missing = [...missing, {
          id: 'store-release-candidate',
          label: candidateEvidence?.label,
          environmentVariable: candidateEvidence?.environmentVariable
        }];
      }
      if (candidateEvidence?.command) commands.push(candidateEvidence.command);
    }
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
    if (stage.id === 'store-review-submission') {
      const evidencePath = env[reviewEvidence?.environmentVariable];
      const deviceEvidencePath = env[reviewEvidence?.deviceEvidenceEnvironmentVariable];
      const distributionEvidencePath = env[reviewEvidence?.distributionEvidenceEnvironmentVariable];
      const buildEvidencePath = env[reviewEvidence?.buildEvidenceEnvironmentVariable];
      const evidence = evidencePath && deviceEvidencePath && distributionEvidencePath && buildEvidencePath
        ? readReviewSubmission({ mobileRoot, evidencePath, deviceEvidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit })
        : { valid: false };
      if (!evidence.valid) {
        missing = [...missing, {
          id: 'store-review-submission-evidence',
          label: reviewEvidence?.label,
          environmentVariable: reviewEvidence?.environmentVariable
        }];
      }
      if (reviewEvidence?.command) commands.push(reviewEvidence.command);
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
