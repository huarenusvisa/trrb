#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "ice-multisource.mjs");
const tempPath = path.join(here, ".ice-multisource-process-only.mjs");

function patchSource(source) {
  let output = source;

  const envNeedle = `  const names = [\n    "X_BEARER_TOKEN",\n    "OPENAI_API_KEY",`;
  const envReplacement = `  const names = [\n    ...(MODE === "process" ? [] : ["X_BEARER_TOKEN"]),\n    "OPENAI_API_KEY",`;
  if (!output.includes(envNeedle)) {
    throw new Error("无法定位ICE环境变量检查代码，停止执行以避免错误修改");
  }
  output = output.replace(envNeedle, envReplacement);

  const modeNeedle = `if (!["collect","bootstrap","dry-run"].includes(MODE))`;
  const modeReplacement = `if (!["collect","bootstrap","dry-run","process"].includes(MODE))`;
  if (!output.includes(modeNeedle)) {
    throw new Error("无法定位ICE运行模式检查代码");
  }
  output = output.replace(modeNeedle, modeReplacement);

  const collectNeedle = `  const seed = await loadSeedSources();\n  await syncSources(seed);\n  let sources = await enabledSources();\n  sources = await validateSources(sources);\n  if (sources.length < 50) throw new Error(\`启用ICE信源少于50个：\${sources.length}\`);\n\n  const allQueries = buildQueries(sources);\n  const queries = selectQueriesForRun(allQueries);\n  console.log(\n    \`启用信源\${sources.length}个，全部查询批次\${allQueries.length}个，本轮执行\${queries.length}个\`\n  );\n\n  let collected = 0;\n  for (const query of queries) collected += await collectQuery(query);`;

  const collectReplacement = `  let collected = 0;\n  if (MODE !== "process") {\n    const seed = await loadSeedSources();\n    await syncSources(seed);\n    let sources = await enabledSources();\n    sources = await validateSources(sources);\n    if (sources.length < 50) throw new Error(\`启用ICE信源少于50个：\${sources.length}\`);\n\n    const allQueries = buildQueries(sources);\n    const queries = selectQueriesForRun(allQueries);\n    console.log(\n      \`启用信源\${sources.length}个，全部查询批次\${allQueries.length}个，本轮执行\${queries.length}个\`\n    );\n    for (const query of queries) collected += await collectQuery(query);\n  } else {\n    console.log("ICE AI process-only：跳过X采集，仅处理数据库待办稿件");\n  }`;

  if (!output.includes(collectNeedle)) {
    throw new Error("无法定位ICE采集主流程代码");
  }
  return output.replace(collectNeedle, collectReplacement);
}

async function run() {
  const source = await fs.readFile(sourcePath, "utf8");
  await fs.writeFile(tempPath, patchSource(source), "utf8");

  const child = spawn(process.execPath, [tempPath, "--mode=process"], {
    cwd: process.cwd(),
    env: { ...process.env, RUN_MODE: "process" },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`ICE AI进程被信号终止：${signal}`));
      else resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`ICE AI process-only退出，状态码${exitCode}`);
  }
}

run()
  .finally(() => fs.rm(tempPath, { force: true }).catch(() => {}))
  .catch((error) => {
    console.error("ICE AI process-only失败：", error);
    process.exitCode = 1;
  });
