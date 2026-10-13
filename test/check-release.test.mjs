import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkRelease, compareVersions } from "../scripts/check-release.mjs";
import { KIT_ROOT, tmpDir } from "./helpers.mjs";

const CHANGELOG = "# Changelog\n\n## 0.4.0 — 2026-10-13\n\n- x\n\n## 0.3.1 — 2026-10-13\n";
const check = (changed, baseVersion, headVersion, changelog = CHANGELOG) =>
  checkRelease({ changed, baseVersion, headVersion, changelog });

test("compareVersions : ordre numérique, pas lexical", () => {
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.throws(() => compareVersions("0.3", "0.3.0"), /version invalide/);
});

test("fichier du plugin modifié sans nouvelle version → échec", () => {
  const errors = check(["scripts/apply.mjs", "docs/x.md"], "0.3.1", "0.3.1");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sans nouvelle version.*scripts\/apply\.mjs/);
  assert.doesNotMatch(errors[0], /docs\/x\.md/);
});

test("chaque dossier du plugin compte", () => {
  for (const f of [
    "modules/core/module.json",
    "skills/sync/SKILL.md",
    "agents/a.md",
    "hooks/hooks.json",
    ".claude-plugin/plugin.json",
  ]) {
    assert.equal(check([f], "0.3.1", "0.3.1").length, 1, f);
  }
});

test("nouvelle version sans entrée au CHANGELOG → échec", () => {
  const errors = check(["scripts/apply.mjs"], "0.3.1", "0.3.2");
  assert.deepEqual(errors, ["CHANGELOG.md n'a pas d'entrée « ## 0.3.2 »"]);
});

test("l'entrée doit être un titre exact, pas une mention ni un préfixe", () => {
  const changelog = "## 0.3.10 — x\n\nvoir 0.3.1\n";
  assert.equal(check(["scripts/a.mjs"], "0.3.0", "0.3.1", changelog).length, 1);
});

test("version inférieure à celle de la base → échec, même sans fichier du plugin", () => {
  const errors = check(["docs/x.md"], "0.4.0", "0.3.1");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /inférieure/);
});

test("seuls docs/, test/ ou .github/ modifiés → succès", () => {
  const changed = ["docs/adr/0005-x.md", "test/a.test.mjs", ".github/workflows/test.yml"];
  assert.deepEqual(check(changed, "0.3.1", "0.3.1"), []);
});

test("nouvelle version avec son entrée → succès", () => {
  assert.deepEqual(check(["scripts/apply.mjs"], "0.3.1", "0.4.0"), []);
});

// Bout en bout : le script lit le diff et les versions dans un vrai dépôt git jetable.
function repo() {
  const dir = tmpDir();
  const run = (...args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  };
  const version = (v) => write(".claude-plugin/plugin.json", JSON.stringify({ version: v }));
  run("init", "-q", "-b", "main");
  version("0.3.1");
  write("CHANGELOG.md", "## 0.3.1\n");
  write("scripts/a.mjs", "1\n");
  run("add", "-A");
  run("commit", "-q", "-m", "base");
  run("switch", "-q", "-c", "pr");
  const commit = () => {
    run("add", "-A");
    run("commit", "-q", "-m", "pr");
  };
  const check = () =>
    spawnSync("node", [path.join(KIT_ROOT, "scripts", "check-release.mjs"), "--base", "main"], {
      cwd: dir,
      encoding: "utf8",
    });
  return { write, version, commit, check };
}

test("CLI : refuse un script modifié sans version, accepte une fois la version montée", () => {
  const r = repo();
  r.write("scripts/a.mjs", "2\n");
  r.commit();
  const ko = r.check();
  assert.equal(ko.status, 1);
  assert.match(ko.stderr, /sans nouvelle version/);

  r.version("0.3.2");
  r.write("CHANGELOG.md", "## 0.3.2\n\n## 0.3.1\n");
  r.commit();
  const ok = r.check();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /0\.3\.1 → 0\.3\.2/);
});

test("CLI : la PR ne touche que docs/ → succès", () => {
  const r = repo();
  r.write("docs/x.md", "x\n");
  r.commit();
  const res = r.check();
  assert.equal(res.status, 0, res.stderr);
});
