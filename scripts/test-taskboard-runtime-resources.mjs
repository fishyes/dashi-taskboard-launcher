#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const resources = readJson("src-tauri/tauri.conf.json").bundle.resources;
const taskboardPackage = readJson("vendor/dashi-taskboard/package.json");

assert.ok(
  taskboardPackage.dependencies?.["smol-toml"],
  "Taskboard server 應宣告 smol-toml 執行期依賴",
);
assert.equal(
  resources["../vendor/dashi-taskboard/node_modules/smol-toml"],
  "vendor/dashi-taskboard/node_modules/smol-toml",
  "Launcher 必須將 Taskboard server 的 smol-toml 執行期依賴封裝進安裝包",
);

console.log("✓ Taskboard 執行期依賴封裝映射正確");
