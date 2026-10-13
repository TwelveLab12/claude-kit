import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = path.join(KIT_ROOT, "test", "fixtures");

export function tmpDir(prefix = "claude-kit-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Copie un projet d'exemple dans un dossier jetable.
export function copyFixture(name) {
  const dest = tmpDir();
  fs.cpSync(path.join(FIXTURES, name), dest, { recursive: true });
  return dest;
}
