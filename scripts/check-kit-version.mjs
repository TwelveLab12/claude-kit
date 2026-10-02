#!/usr/bin/env node
// SessionStart hook: when the current project was generated with an older claude-kit, tell
// Claude (stdout is added to the session context). Silent otherwise, and never fails the session.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  const lockFile = path.join(process.cwd(), ".claude", "kit.lock.json");
  if (fs.existsSync(lockFile)) {
    const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const current = JSON.parse(
      fs.readFileSync(path.join(kitRoot, ".claude-plugin", "plugin.json"), "utf8"),
    ).version;
    const used = JSON.parse(fs.readFileSync(lockFile, "utf8")).kitVersion;
    const toNum = (v) => v.split(".").map(Number);
    const [a, b] = [toNum(used), toNum(current)];
    const older = a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
    if (older) {
      console.log(
        `claude-kit : ce projet utilise le kit ${used}, la version installée est ${current}. ` +
          "Propose à l'utilisateur de lancer /claude-kit:sync (sans l'imposer).",
      );
    }
  }
} catch {
  // A broken lock file must not block the session.
}
