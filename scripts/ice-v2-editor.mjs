#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const child = spawn(process.execPath, ["scripts/ice-translate-title-body.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ICE_NORMALIZE_MAX_STORIES: process.env.ICE_V2_EDITOR_MAX || "40"
  }
});

child.on("error", (error) => {
  console.error("ICE v2 editor could not start:", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`ICE v2 editor stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = Number(code || 0);
});
