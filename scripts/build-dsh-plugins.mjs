import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const outputDir = resolve(root, ".artifacts/dsh-plugins");
const lockDir = resolve(root, ".artifacts/dsh-plugins.lock");
const plugins = [
  {
    source: "vendor/dsh-client-connection-authz",
    commit: "873c465f140310e5ecc54ff797932e27bccb8f0e",
    output: "dsh-client-connection-authz-873c465f1403.tgz",
  },
  {
    source: "vendor/dsh-auth-tailscale",
    commit: "ea7ca9fa3db4ef237cb6f9194bb34e4ee3593ada",
    output: "dsh-auth-tailscale-ea7ca9fa3db4.tgz",
  },
];

// 获取互斥锁：并发跑 build:dsh-plugins（如 tauri dev 与手动同时执行）会互相
// 删对方正在用的 vendor/node_modules 与 .pack-* 目录，导致 tsc/pack 无意义失败
// （表现为 build:host 无输出失败 + 后续资源缺失）。mkdir wx 原子创建，拿不到即退出。
function acquireLock() {
  mkdirSync(resolve(root, ".artifacts"), { recursive: true });
  try {
    mkdirSync(lockDir, { recursive: false });
    writeFileSync(join(lockDir, "owner"), `${process.pid}\n`);
  } catch (e) {
    if (e && e.code === "EEXIST") {
      fail(`another build:dsh-plugins is already running (lock at ${lockDir}); wait for it to finish and retry`);
    }
    throw e;
  }
}

function releaseLock() {
  rmSync(lockDir, { recursive: true, force: true });
}

function fail(message) {
  throw new Error(message);
}

function run(args) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) fail(`pnpm failed: ${result.error.message}`);
  if (result.status !== 0) fail(`pnpm ${args.join(" ")} exited with ${result.status ?? 1}`);
}

function gitHead(sourceDir) {
  const result = spawnSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) fail(`git failed: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`cannot read the pinned commit for ${sourceDir}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function main() {
  acquireLock();
  try {
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    for (const plugin of plugins) {
      const sourceDir = resolve(root, plugin.source);
      const actualCommit = gitHead(sourceDir);
      if (actualCommit !== plugin.commit) {
        fail(`${plugin.source} is at ${actualCommit}; expected pinned commit ${plugin.commit}`);
      }
      const packDir = join(outputDir, `.pack-${plugin.output}`);
      mkdirSync(packDir, { recursive: true });
      try {
        // 這些固定版外掛是獨立 repo，不屬於 Launcher 的 pnpm workspace。
        // pnpm 11 若未明確忽略父層 workspace，會顯示安裝成功卻不建立 node_modules。
        // 依賴安裝停用 lifecycle scripts；pack 只執行已核對 commit 的外掛 prepare/build。
        run(["--dir", sourceDir, "install", "--frozen-lockfile", "--ignore-workspace", "--ignore-scripts"]);
        if (plugin.source === "vendor/dsh-auth-tailscale") {
          // tailscale 外掛的固定版 Git 開發依賴在 pnpm 11 停用 lifecycle scripts 後沒有 lib/types。
          // 改連到上一輪已驗證 commit 並完成 build 的本機子模組，避免放寬所有依賴腳本權限。
          const dependencyPath = join(
            sourceDir,
            "node_modules",
            "@dsh-external",
            "dsh-client-connection-authz",
          );
          rmSync(dependencyPath, { recursive: true, force: true });
          mkdirSync(dirname(dependencyPath), { recursive: true });
          symlinkSync(
            resolve(root, "vendor/dsh-client-connection-authz"),
            dependencyPath,
            process.platform === "win32" ? "junction" : "dir",
          );
        }
        run(["--dir", sourceDir, "pack", "--ignore-workspace", "--pack-destination", packDir]);
        const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
        if (tarballs.length !== 1) {
          fail(`${plugin.source} produced ${tarballs.length} tarballs; expected exactly one`);
        }
        renameSync(join(packDir, tarballs[0]), join(outputDir, plugin.output));
      } finally {
        rmSync(packDir, { recursive: true, force: true });
        rmSync(join(sourceDir, "node_modules"), { recursive: true, force: true });
      }
    }

    console.log(`✓ Built ${plugins.length} pinned dsh plugin tarballs in .artifacts/dsh-plugins`);
  } finally {
    releaseLock();
  }
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
