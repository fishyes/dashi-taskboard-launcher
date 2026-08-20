/**
 * Tauri updater 构建脚本。
 * 1. 生成生产 updater 配置
 * 2. 校验 updater 配置
 * 3. 构建 vendored taskboard 的 web UI（dist 被 gitignore，不构建则
 *    打包资源里没有静态页，注入到 Codex 的面板永远 404）
 * 4. 使用该配置作为 overlay 执行 tauri build
 *
 * 用法: node scripts/build-updater.mjs [--target <target>]
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const updaterConfigPath = "src-tauri/tauri.conf.updater.prod.json";

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env,
    shell: options.shell ?? false,
  });

  if (result.error) {
    fail(`执行 ${command} 失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`执行 ${command} ${args.join(" ")} 失败：退出码 ${result.status ?? 1}`);
  }
}

function normalizeForwardedArgs(args = []) {
  return args.filter((arg) => arg !== "--");
}

function main(argv = process.argv.slice(2)) {
  // Step 1: 生成 updater 配置
  run(process.execPath, ["scripts/generate-updater-config.mjs"]);

  // Step 2: 校验 updater 配置
  run(process.execPath, ["scripts/validate-updater-config.mjs", updaterConfigPath]);

  // Step 3: 构建 vendored taskboard 的 web UI，产物落进打包资源
  // vendor/dashi-taskboard 是独立 npm 子模块（上游维护自己的 lockfile），保持 npm 边界
  run("npm", ["--prefix", "vendor/dashi-taskboard", "ci"], { shell: true });
  run("npm", ["--prefix", "vendor/dashi-taskboard", "run", "build:web"], { shell: true });
  // 前端建置依賴不得進入封裝；但 server 會在執行期直接 import smol-toml，
  // 必須保留這個已在 bundle.resources 明確列出的套件。
  const nodeModulesDir = "vendor/dashi-taskboard/node_modules";
  for (const entry of readdirSync(nodeModulesDir)) {
    if (entry === "smol-toml") continue;
    rmSync(join(nodeModulesDir, entry), { recursive: true, force: true });
  }

  // Step 4: 使用 overlay 配置执行 tauri build，透传额外参数
  // pnpm 与 npm 不同：不消费 `--` 分隔符（会把 `--` 原样传给 tauri CLI 导致
  // `tauri -- build` 报 unexpected argument），所以直接追加参数、不再拼 `--`
  const tauriArgs = [
    "run-script",
    "tauri",
    "build",
    "--config",
    updaterConfigPath,
    ...normalizeForwardedArgs(argv),
  ];

  // Windows 上 spawnSync 找不到 pnpm，需要 shell 模式
  run("pnpm", tauriArgs, { shell: true });
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main();
}
