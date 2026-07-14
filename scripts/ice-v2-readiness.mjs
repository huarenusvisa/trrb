#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { readinessResult } from "./ice-v2-readiness-core.mjs";

const policy = JSON.parse(fs.readFileSync(new URL("../data/ice-v2-source-policy.json", import.meta.url), "utf8"));
const result = readinessResult({ policy });
console.log(JSON.stringify({ stage: "ice-v2-readiness", ...result }, null, 2));
if (!result.ready) process.exitCode = 1;
