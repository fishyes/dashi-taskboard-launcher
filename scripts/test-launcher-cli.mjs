import assert from "node:assert/strict";
import path from "node:path";

import {
  configCandidates,
  formatHuman,
  launcherCandidates,
  normalizeCommand,
} from "./dashi-launcher-cli.mjs";

assert.deepEqual(normalizeCommand(["status"]), { command: "status", json: false });
assert.deepEqual(normalizeCommand(["start", "--json"]), { command: "start", json: true });
assert.deepEqual(normalizeCommand(["skill", "reinstall"]), {
  command: "skill-reinstall",
  json: false,
});
assert.throws(() => normalizeCommand(["skill", "install"]), /不支援的命令/);

assert.deepEqual(configCandidates({ USERPROFILE: "C:\\Users\\Tester" }), [
  path.join("C:\\Users\\Tester", ".codex-pro-max", "config.json"),
  path.join("C:\\Users\\Tester", ".dashi-taskboard-launcher", "config.json"),
]);

const executableCandidates = launcherCandidates(
  { LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local" },
  "C:\\bundle",
);
assert.equal(executableCandidates[0], path.join("C:\\bundle", "codex-pro-max.exe"));
assert.ok(executableCandidates.includes(path.join(
  "C:\\Users\\Tester\\AppData\\Local",
  "Codex Pro Max",
  "codex-pro-max.exe",
)));
assert.ok(executableCandidates.some((candidate) => candidate.endsWith("dashi-taskboard-launcher.exe")));

assert.equal(
  formatHuman({
    ok: true,
    message: "Launcher status",
    processes: [{ name: "taskboard-server", status: "running", pid: 123, message: "ready" }],
  }),
  "OK: Launcher status\ntaskboard-server\trunning\tPID 123\tready",
);

console.log("Launcher CLI tests passed");
