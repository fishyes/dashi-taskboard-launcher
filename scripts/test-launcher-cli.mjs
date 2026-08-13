import assert from "node:assert/strict";
import { formatHuman, normalizeCommand } from "./dashi-launcher-cli.mjs";

assert.deepEqual(normalizeCommand(["status"]), { command: "status", json: false });
assert.deepEqual(normalizeCommand(["start", "--json"]), { command: "start", json: true });
assert.deepEqual(normalizeCommand(["skill", "reinstall"]), {
  command: "skill-reinstall",
  json: false,
});
assert.throws(() => normalizeCommand(["skill", "install"]), /不支援的命令/);

assert.equal(
  formatHuman({
    ok: true,
    message: "Launcher status",
    processes: [{ name: "taskboard-server", status: "running", pid: 123, message: "ready" }],
  }),
  "OK: Launcher status\ntaskboard-server\trunning\tPID 123\tready",
);

console.log("Launcher CLI tests passed");
