import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = path.join(KIT_ROOT, "test", "fixtures");
const FAKES = path.join(KIT_ROOT, "test", "fakes");

export function tmpDir(prefix = "claude-kit-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Copie un projet d'exemple dans un dossier jetable.
export function copyFixture(name) {
  const dest = tmpDir();
  fs.cpSync(path.join(FIXTURES, name), dest, { recursive: true });
  return dest;
}

// Lance un script du kit avec le faux gh en tête du PATH ; renvoie la sortie et les appels reçus.
export function runWithFakeGh(script, args, scenario) {
  const cwd = tmpDir();
  const log = path.join(cwd, "gh.log");
  fs.writeFileSync(log, "");
  const result = spawnSync("node", [path.join(KIT_ROOT, "scripts", script), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${FAKES}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_SCENARIO: JSON.stringify(scenario),
    },
  });
  const calls = fs
    .readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { ...result, calls };
}
