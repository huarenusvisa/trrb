import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const adminHtml = read('admin/index.html');
assert.match(adminHtml, /id="automation-notification-panel"/);
assert.match(adminHtml, /id="automation-notification-list"/);

const control = read('netlify/functions/automation-control.js');
const controlUi = read('admin/automation-control.js');
const seoWorkflow = read('.github/workflows/seo-search-engine-ops.yml');
assert.match(control, /CONTROL_PLANE_WORKFLOW = 'operations-control-plane\.yml'/);
assert.match(control, /seo_suite[\s\S]*seo_indexnow[\s\S]*seo_search_engine[\s\S]*monitor/);
assert.match(control, /controlKeyFilter\(targetKeys\)/);
assert.match(controlUi, /SEO自动收录/);
assert.match(controlUi, /ICE自动维护/);
assert.match(controlUi, /旧站404自动检查/);
assert.match(controlUi, /立即同步一次/);
assert.match(controlUi, /开始恢复旧文章/);
assert.match(controlUi, /下载404报告（TXT）/);
assert.match(controlUi, /download_legacy_404_report/);
assert.match(controlUi, /payload\.download_url/);
assert.match(control, /downloadLegacy404Report/);
assert.match(control, /expires_in: 60/);
assert.match(controlUi, /automation-advanced/);
assert.match(controlUi, /开启自动任务/);
assert.match(controlUi, /固定安全规则/);
assert.doesNotMatch(seoWorkflow, /Submit fresh URLs through IndexNow/);
assert.match(control, /not\.in\.\(global,seo_metadata,legacy_recovery\)/);
assert.match(control, /in\.\(seo_metadata,legacy_recovery\)/);
assert.match(control, /CONTROL_PLANE_KEYS\.has\(key\).*CONTROL_PLANE_WORKFLOW/s);
assert.match(control, /ice-auto-publish\.yml/);
assert.match(control, /ice-emergency-watchdog\.yml/);
assert.match(control, /title: `\$\{existing\.display_name\}已打开`/);
assert.match(control, /title: fullyStopped \? `\$\{existing\.display_name\}已停止`/);
assert.match(control, /STOP_POLL_ATTEMPTS = 8/);
assert.match(control, /closeGlobalIfNoEnabledChildren/);
assert.match(control, /enabled: 'eq\.true'/);

const legacyRecovery = read('.github/workflows/legacy-search-recovery.yml');
assert.doesNotMatch(legacyRecovery, /confirm_apply/);

const iceEntries = [
  '.github/workflows/ice-auto-publish.yml',
  '.github/workflows/ice-collector-continuous.yml',
  '.github/workflows/ice-publisher-continuous.yml',
  '.github/workflows/ice-watchdog.yml',
  '.github/workflows/ice-emergency-watchdog.yml',
  '.github/workflows/ice-rescue-direct.yml',
  '.github/workflows/ice-forced-clock.yml'
];
for (const path of iceEntries) {
  const workflow = read(path);
  assert.match(workflow, /automation-gate:/, `${path} must have hard gate`);
  assert.match(workflow, /outputs\.global == 'true'.*outputs\.ice == 'true'/s, `${path} must require global + ice`);
}

const emergency = read('.github/workflows/ice-emergency-watchdog.yml');
assert.match(emergency, /operations-control-plane\.yml\/dispatches/);
assert.doesNotMatch(emergency, /ice-unified-pipeline\.yml\/dispatches/);

const plane = read('.github/workflows/operations-control-plane.yml');
assert.match(plane, /发送机器人站内错误通知/);
assert.match(plane, /node scripts\/automation-notify\.mjs/);

console.log('Automation control contract passed: grouped controls, deduplicated SEO dispatch, UI notifications, hard gates, manual-task isolation and ICE emergency routing are enforced.');
