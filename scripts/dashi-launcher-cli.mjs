#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONTROL_HOST = "127.0.0.1";
const CONTROL_PORT = 47824;
const REQUEST_TIMEOUT_MS = 90_000;
const STARTUP_TIMEOUT_MS = 12_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));

export const usage = `Codex Pro Max Launcher CLI

用法:
  dashi-launcher status [--json]
  dashi-launcher start [--json]
  dashi-launcher inject [--json]
  dashi-launcher start --restart-codex [--json]
  dashi-launcher stop [--json]
  dashi-launcher restart [--json]
  dashi-launcher skill reinstall [--json]
`;

export function normalizeCommand(rawArgs) {
  const args = rawArgs.filter((arg) => arg !== "--json");
  const json = rawArgs.includes("--json");
  if (args.length === 1 && ["status", "start", "stop", "restart"].includes(args[0])) {
    return { command: args[0], json };
  }
  if (
    (args.length === 1 && args[0] === "inject") ||
    (args.length === 2 && args[0] === "start" && args[1] === "--restart-codex")
  ) {
    return { command: "inject", json };
  }
  if (
    (args.length === 2 && args[0] === "skill" && args[1] === "reinstall") ||
    (args.length === 1 && args[0] === "skill-reinstall")
  ) {
    return { command: "skill-reinstall", json };
  }
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", json };
  }
  throw new Error(`不支援的命令: ${args.join(" ")}`);
}

export function configCandidates(env = process.env) {
  const home = env.USERPROFILE || env.HOME;
  if (!home) throw new Error("找不到使用者主目錄");
  return [
    join(home, ".codex-pro-max", "config.json"),
    join(home, ".dashi-taskboard-launcher", "config.json"),
  ];
}

function configPath() {
  const candidates = configCandidates();
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

async function readSecret() {
  const config = JSON.parse(await readFile(configPath(), "utf8"));
  if (typeof config.instance_secret !== "string" || config.instance_secret.length < 32) {
    throw new Error("Launcher 尚未建立 CLI 控制憑據");
  }
  return config.instance_secret;
}

export function launcherCandidates(env = process.env, currentScriptDir = scriptDir) {
  const currentExe = "codex-pro-max.exe";
  const legacyExe = "dashi-taskboard-launcher.exe";
  return [
    env.CODEX_PRO_MAX_EXE,
    env.DASHI_LAUNCHER_EXE,
    join(currentScriptDir, currentExe),
    env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, "Codex Pro Max", currentExe)
      : undefined,
    join(currentScriptDir, "..", "src-tauri", "target", "release", currentExe),
    join(currentScriptDir, "..", "src-tauri", "target", "debug", currentExe),
    join(currentScriptDir, legacyExe),
    env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, "Dashi Taskboard Launcher", legacyExe)
      : undefined,
    join(currentScriptDir, "..", "src-tauri", "target", "release", legacyExe),
    join(currentScriptDir, "..", "src-tauri", "target", "debug", legacyExe),
  ].filter(Boolean);
}

export function findLauncherExecutable() {
  const found = launcherCandidates().find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("找不到 codex-pro-max.exe，請先安裝或設定 CODEX_PRO_MAX_EXE");
  }
  return found;
}

async function sendCommand(command, timeoutMs = REQUEST_TIMEOUT_MS) {
  const secret = await readSecret();
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CONTROL_HOST, port: CONTROL_PORT });
    let response = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ secret, command })}\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      try {
        finish(resolve, JSON.parse(response.slice(0, newline)));
      } catch (error) {
        finish(reject, new Error(`Launcher 回傳無效 JSON: ${error.message}`));
      }
    });
    socket.once("timeout", () => finish(reject, new Error("Launcher CLI 控制請求逾時")));
    socket.once("error", (error) => finish(reject, error));
    socket.once("end", () => {
      if (!settled) finish(reject, new Error("Launcher 在回應前關閉連線"));
    });
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function ensureControlService() {
  try {
    return await sendCommand("ping", 1_000);
  } catch {
    const executable = findLauncherExecutable();
    const child = spawn(executable, ["--cli-daemon"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    await delay(250);
    try {
      return await sendCommand("ping", 1_000);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Launcher CLI 控制服務啟動失敗: ${lastError?.message || "逾時"}`);
}

export function formatHuman(response) {
  const lines = [`${response.ok ? "OK" : "ERROR"}: ${response.message}`];
  if (Array.isArray(response.processes)) {
    for (const processInfo of response.processes) {
      const pid = processInfo.pid == null ? "-" : processInfo.pid;
      lines.push(`${processInfo.name}\t${processInfo.status}\tPID ${pid}\t${processInfo.message || ""}`);
    }
  }
  if (response.integration) {
    lines.push(
      `codex-integration\t${response.integration.state}\tCDP ${response.integration.cdpPort}\t${response.integration.message || ""}`,
    );
  }
  return lines.join("\n");
}

export async function runCli(rawArgs) {
  const parsed = normalizeCommand(rawArgs);
  if (parsed.command === "help") {
    return { exitCode: 0, output: usage };
  }

  await ensureControlService();
  const response = await sendCommand(parsed.command);
  return {
    exitCode: response.ok ? 0 : 1,
    output: parsed.json ? JSON.stringify(response) : formatHuman(response),
  };
}

async function main() {
  try {
    const result = await runCli(process.argv.slice(2));
    process.stdout.write(`${result.output.trimEnd()}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n${usage}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
