#!/usr/bin/env node
// Contrôle de version d'une PR du kit : une version doit toujours désigner le même code (le sync
// et le hook de démarrage comparent les versions, et le cache du plugin est rangé par version).
//
//   node scripts/check-release.mjs [--base origin/main]
//
// Compare HEAD à la base : si un fichier du plugin change, `version` de plugin.json doit monter et
// CHANGELOG.md doit avoir un titre `## <version>`. Une version qui descend est toujours refusée.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Ce que le plugin installé contient. Le reste (docs/, test/, .github/, README…) ne change pas le
// comportement d'un poste qui a déjà la version.
export const PLUGIN_PATHS = ["modules/", "skills/", "scripts/", "agents/", "hooks/", ".claude-plugin/"];

const PLUGIN_JSON = ".claude-plugin/plugin.json";

function parseVersion(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) throw new Error(`version invalide : ${v}`);
  return v.split(".").map(Number);
}

// -1, 0 ou 1.
export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export function hasChangelogEntry(changelog, version) {
  return changelog.split("\n").some((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
}

// Renvoie la liste des erreurs (vide si la PR est conforme).
export function checkRelease({ changed, baseVersion, headVersion, changelog }) {
  const errors = [];
  const order = compareVersions(headVersion, baseVersion);
  const pluginFiles = changed.filter((f) => PLUGIN_PATHS.some((p) => f.startsWith(p)));
  if (order < 0) {
    errors.push(`la version ${headVersion} est inférieure à celle de la base (${baseVersion})`);
  } else if (order === 0 && pluginFiles.length) {
    errors.push(
      `des fichiers du plugin changent sans nouvelle version (${baseVersion}) : ` +
        `${pluginFiles.join(", ")}. Monter \`version\` dans ${PLUGIN_JSON}.`,
    );
  }
  if (order > 0 && !hasChangelogEntry(changelog, headVersion)) {
    errors.push(`CHANGELOG.md n'a pas d'entrée « ## ${headVersion} »`);
  }
  return errors;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main(argv) {
  const i = argv.indexOf("--base");
  const base = i >= 0 ? argv[i + 1] : "origin/main";
  const changed = git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean);
  const baseVersion = JSON.parse(git(["show", `${base}:${PLUGIN_JSON}`])).version;
  const headVersion = JSON.parse(fs.readFileSync(PLUGIN_JSON, "utf8")).version;
  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
  const errors = checkRelease({ changed, baseVersion, headVersion, changelog });
  if (errors.length) {
    for (const e of errors) console.error(`check-release : ${e}`);
    process.exit(1);
  }
  console.log(`check-release : ok (${baseVersion} → ${headVersion}, ${changed.length} fichier(s))`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
