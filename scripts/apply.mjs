#!/usr/bin/env node
// claude-kit — deterministic half of the scaffold.
//
// The /claude-kit:scaffold and /claude-kit:sync skills ask the questions and write the
// project-specific parts; this script does everything mechanical so the result is reproducible
// (and runnable without Claude, e.g. by the canary workflow).
//
//   node apply.mjs list
//   node apply.mjs create <dir> --modules a,b,c [--var k=v]... [--react-compiler]
//   node apply.mjs apply  <dir> --modules a,b,c [--var k=v]... [--dry-run] [--no-install]
//   node apply.mjs apply  <dir> --from-lock [--add m] [--remove m] [--dry-run] [--no-install]
//
// Every file a module ships is one of:
//   managed/  owned by the kit: a project change is reported, never overwritten.
//   seed/     owned by the project once created: follows the kit while the project leaves it
//             intact; otherwise a rendered proposal is written to a temp dir for review.
//   merge/    JSON deep-merged into the project's file (arrays are unioned).
//   rules.md  Claude rules, written to .claude/kit/<module>.md and imported from CLAUDE.md.
//
// A sync compares three versions of each file, block and package.json key (ADR 0008): the base
// (what the kit rendered last time, kept in .claude/kit/base.json), the project, and the kit's
// current render. It only writes what the project left untouched.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareVersions } from "./check-release.mjs";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = path.join(KIT_ROOT, "modules");
const KIT_VERSION = readJson(path.join(KIT_ROOT, ".claude-plugin", "plugin.json")).version;
const MANIFEST = readJson(path.join(MODULES_DIR, "manifest.json"));
const DEP_DOCS = readJson(path.join(MODULES_DIR, "dependencies.json"));
const LOCK_PATH = ".claude/kit.lock.json";
const BASE_PATH = ".claude/kit/base.json";
const CLAUDE_BLOCK = ["<!-- BEGIN:claude-kit -->", "<!-- END:claude-kit -->"];
const GITIGNORE_BLOCK = ["# >>> claude-kit", "# <<< claude-kit"];
const CSS_BLOCK = ["/* >>> claude-kit */", "/* <<< claude-kit */"];
const BLOCKS = { ".gitignore": GITIGNORE_BLOCK, "CLAUDE.md": CLAUDE_BLOCK };
// Markers of the kit block of a file: fixed for .gitignore and CLAUDE.md, CSS comments for a
// stylesheet (a `block/` directory of a module, e.g. a11y's global focus ring in globals.css).
const markersFor = (rel) => BLOCKS[rel] ?? (rel.endsWith(".css") ? CSS_BLOCK : undefined);

// ---------------------------------------------------------------------------------------------
// Helpers

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function toJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Deep merge; `preferIncoming` decides who wins on scalar conflicts. Arrays are unioned.
function deepMerge(existing, incoming, preferIncoming) {
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return [...existing, ...incoming.filter((item) => !existing.includes(item))];
  }
  if (isPlainObject(existing) && isPlainObject(incoming)) {
    const out = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      out[key] = key in existing ? deepMerge(existing[key], value, preferIncoming) : value;
    }
    return out;
  }
  if (existing === undefined) return incoming;
  return preferIncoming ? incoming : existing;
}

function parseArgs(argv) {
  const args = { _: [], vars: {}, add: [], remove: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--modules") args.modules = argv[++i].split(",").filter(Boolean);
    else if (arg === "--var") {
      const [key, ...rest] = argv[++i].split("=");
      args.vars[key] = rest.join("=");
    } else if (arg === "--add") args.add.push(...argv[++i].split(","));
    else if (arg === "--remove") args.remove.push(...argv[++i].split(","));
    else if (arg.startsWith("--")) args[arg.slice(2)] = true;
    else args._.push(arg);
  }
  return args;
}

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: process.env.CI ?? "" } });
}

// ---------------------------------------------------------------------------------------------
// Modules

function loadModules() {
  const modules = new Map();
  for (const id of MANIFEST.order) {
    const dir = path.join(MODULES_DIR, id);
    const meta = readJson(path.join(dir, "module.json"));
    modules.set(id, { ...meta, dir });
  }
  return modules;
}

function resolveSelection(all, requested) {
  const selected = new Set(["core", ...(requested.includes("all") ? all.keys() : requested)]);
  for (const id of selected) {
    if (!all.has(id)) throw new Error(`Module inconnu : ${id}`);
    for (const dep of all.get(id).requires ?? []) selected.add(dep);
  }
  return MANIFEST.order.filter((id) => selected.has(id)).map((id) => all.get(id));
}

// ---------------------------------------------------------------------------------------------
// Templating: {{var}} and non-nested {{#if key}}…{{/if}} (key = selected module id or truthy var).

function makeRenderer(ctx) {
  // `a+b` is true when every part is (selected module or truthy var).
  const truthy = (key) =>
    key.split("+").every((part) => ctx.selected.has(part) || Boolean(ctx.vars[part]));
  return function render(text) {
    return text
      .replace(/\{\{#if ([\w+-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) =>
        truthy(key) ? body : "",
      )
      .replace(/\{\{([\w-]+)\}\}/g, (match, key) => {
        if (key in ctx.vars) return String(ctx.vars[key]);
        ctx.report.unresolved.add(key);
        return match;
      });
  };
}

// Major of a version or range ("^20.19.0", "v24", "24.1.0"); null without a digit ("lts/*").
const majorOf = (spec) => /\d+/.exec(String(spec ?? ""))?.[0] ?? null;

// `@types/node` follows the Node major the project runs (Volta pin, else .nvmrc, else the kit's
// default version), not the latest published one (ADR 0007). An alias (`lts/*`, `lts/iron`) gives
// `ok: null`: the major is unknown, reported as such and never guessed.
function nodeTypesStatus(pkg, target, vars) {
  const types = { ...pkg.dependencies, ...pkg.devDependencies }["@types/node"];
  if (types === undefined) return null;
  const nvmrc = readIfExists(path.join(target, ".nvmrc"));
  const [source, version] = pkg.volta?.node
    ? ["volta.node", pkg.volta.node]
    : nvmrc !== null
      ? [".nvmrc", nvmrc]
      : ["nodeVersion du kit", vars.nodeVersion];
  const nodeMajor = majorOf(version);
  const ok = nodeMajor === null ? null : majorOf(types) === nodeMajor;
  return { source, nodeMajor, types, ok };
}

function joinFr(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function computeVars(mods, selected, baseVars, projectName) {
  const vars = { ...MANIFEST.defaults, projectName, ...baseVars };
  if (vars.run === "volta") vars.run = "volta run pnpm";
  vars.volta = vars.run.startsWith("volta") ? "1" : "";
  vars.nodeFromNvmrc = vars.volta ? "" : "1";
  vars.pm = "pnpm";
  for (const mod of mods) {
    for (const [key, value] of Object.entries(mod.vars ?? {})) {
      if (!(key in baseVars)) vars[key] = value;
    }
  }
  // Module var defaults may reference other vars ({{projectName}}): resolve one level.
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string") {
      vars[key] = value.replace(/\{\{([\w-]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
    }
  }

  const has = (id) => selected.has(id);
  const baseline = baselineSteps(selected);
  const command = (script) => `\`${vars.run} ${script}\``;
  vars.baselineCommit = joinFr(baseline.commit.map(command));
  vars.baselinePr = joinFr(baseline.pr.map(command));
  vars.ciSteps = ciStepList(selected).join(" → ");
  vars.lintStagedTools = [has("prettier") && "prettier", has("eslint") && "eslint --fix"]
    .filter(Boolean)
    .join(" + ");
  vars.eslintIgnores = mods
    .flatMap((m) => m.eslintIgnores ?? [])
    .map((p) => `    "${p}",`)
    .join("\n");
  return vars;
}

// ---------------------------------------------------------------------------------------------
// Composite files (built from several modules)

function ciStepList(selected) {
  return [
    "typecheck",
    selected.has("prettier") && "format:check",
    selected.has("eslint") && "lint:ci",
    selected.has("vitest") && "test",
    "build",
    selected.has("playwright") && "test:e2e",
  ].filter(Boolean);
}

// The local baseline is the CI, in two stages. Before each commit: every CI step but the build and
// the e2e. Before the PR: the rest too, `test:e2e:ci` standing for both (it builds, then runs the
// e2e as the CI does: production server, one worker, retries).
function baselineSteps(selected) {
  const steps = ciStepList(selected);
  const commit = steps.filter((step) => step !== "build" && step !== "test:e2e");
  const rest = steps.filter((step) => !commit.includes(step));
  return { commit, pr: [...commit, ...(rest.includes("test:e2e") ? ["test:e2e:ci"] : rest)] };
}

// A green run takes 5 to 8 minutes (workout-manager, October 2026).
const JOB_TIMEOUT_MINUTES = 15;

// Deployment Check Vercel (ADR 0010): the build job sets its own commit status, pending first, then
// from `job.status` in a last step that always runs. vercel/repository-dispatch/actions/status
// reported the first job of the run, whatever its name (vercel/repository-dispatch#15): the
// advisory a11y job could turn a failed build into a success.
function vercelStatusSteps() {
  const post = (state, description) => [
    `          gh api "repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" --silent \\`,
    `            -f context="$VERCEL_CHECK" -f state=${state} -f description="${description}" \\`,
    `            -f target_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"`,
  ];
  return {
    pending: [
      "      # Statut Vercel « en cours » avant toute autre étape, état réel du job à la dernière.",
      "      - name: Statut Vercel (en cours)",
      "        env:",
      "          GH_TOKEN: ${{ github.token }}",
      "        run: |",
      ...post("pending", "Job build en cours"),
    ],
    result: [
      "      # Toujours exécutée : seul un job build réussi pose success, quels que soient les autres",
      "      # jobs du workflow.",
      "      - name: Statut Vercel (résultat du job)",
      "        if: always()",
      "        env:",
      "          GH_TOKEN: ${{ github.token }}",
      "          JOB_STATUS: ${{ job.status }}",
      "        run: |",
      "          state=failure",
      '          if [ "$JOB_STATUS" = success ]; then state=success; fi',
      ...post('"$state"', "Job build : $JOB_STATUS"),
    ],
  };
}

function renderCi(selected, vars) {
  const vercel = selected.has("vercel-check") && vercelStatusSteps();
  const lines = [
    "# Géré par claude-kit : régénéré par /claude-kit:sync, ne pas éditer à la main.",
    "name: CI",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    // Without a cap, a stuck step (apt mirrors during `playwright install --with-deps`) runs for
    // GitHub's 360-minute default, and the Vercel check stays pending all along.
    `    timeout-minutes: ${JOB_TIMEOUT_MINUTES}`,
    "    permissions:",
    "      contents: read",
  ];
  // The name is written once, at job level: Vercel matches the status by this exact context.
  if (vercel) {
    lines.push(
      "      statuses: write",
      "    # Deployment Check sélectionné dans Vercel (Settings > Deployment Checks) : ne pas changer ce",
      "    # nom sans mettre Vercel à jour.",
      "    env:",
      `      VERCEL_CHECK: "${vars.vercelCheckName}"`,
    );
  }
  lines.push("    steps:");
  if (vercel) lines.push(...vercel.pending, "");
  lines.push("      - uses: actions/checkout@v7", "");
  // One source of truth for the Node version: Volta's pin in package.json (setup-node reads
  // `volta.node`) for Volta users, .nvmrc otherwise.
  const setup = [
    "      - uses: pnpm/action-setup@v6",
    "",
    "      - uses: actions/setup-node@v7",
    "        with:",
    `          node-version-file: ${vars.volta ? "package.json" : ".nvmrc"}`,
    "          cache: pnpm",
    "",
    "      - run: pnpm install --frozen-lockfile",
  ];
  // Browsers cached per Playwright version. `--with-deps` still installs the system libraries
  // (apt), which the cache does not cover.
  const playwrightInstall = [
    "",
    "      - name: Version de Playwright",
    "        id: playwright",
    `        run: echo "version=$(pnpm exec playwright --version | cut -d' ' -f2)" >> "$GITHUB_OUTPUT"`,
    "",
    "      - uses: actions/cache@v6",
    "        with:",
    "          path: ~/.cache/ms-playwright",
    "          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}",
    "",
    "      - run: pnpm exec playwright install --with-deps chromium",
  ];
  const playwrightReport = (name) => [
    "",
    "      - uses: actions/upload-artifact@v7",
    "        if: failure()",
    "        with:",
    `          name: ${name}`,
    "          path: playwright-report/",
    "          retention-days: 7",
  ];
  // a11yGate=advisory (adopting a project with accessibility debt): the @a11y e2e specs leave the
  // gating job for a separate `continue-on-error` job, until the debt is cleared.
  const advisory = selected.has("a11y") && selected.has("playwright") && vars.a11yGate === "advisory";

  lines.push(...setup);
  for (const step of ciStepList(selected)) {
    if (step === "test:e2e") {
      lines.push(...playwrightInstall);
      lines.push("", `      - run: pnpm test:e2e${advisory ? " --grep-invert @a11y" : ""}`);
    } else lines.push("", `      - run: pnpm ${step}`);
  }
  if (selected.has("playwright")) lines.push(...playwrightReport("playwright-report"));
  if (vercel) lines.push("", ...vercel.result);

  if (advisory) {
    lines.push(
      "",
      "  # Accessibilité sur le rendu (e2e/a11y.spec.ts) : informatif, ne bloque ni le merge ni la",
      "  # mise en production tant que la dette existante n'est pas résorbée (voir l'ADR de stratégie",
      "  # accessibilité). Le rendre bloquant : retirer la variable a11yGate du lock, puis sync.",
      "  a11y:",
      "    runs-on: ubuntu-latest",
      "    continue-on-error: true",
      `    timeout-minutes: ${JOB_TIMEOUT_MINUTES}`,
      "    permissions:",
      "      contents: read",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "",
      ...setup,
      ...playwrightInstall,
      "",
      "      - run: pnpm build",
      "",
      "      - run: pnpm test:e2e --grep @a11y",
      ...playwrightReport("a11y-report"),
    );
  }
  return lines.join("\n") + "\n";
}

function renderPrettierrc(selected, vars) {
  const config = { semi: true, singleQuote: false, printWidth: 100 };
  if (selected.has("tailwind-shadcn")) {
    config.plugins = ["prettier-plugin-tailwindcss"];
    // Tailwind v4: without the stylesheet, the plugin does not know the project's `@theme` tokens
    // (bg-card, text-primary) and sorts them first, as unknown classes. Path relative to this file.
    config.tailwindStylesheet = `./${vars.src}app/globals.css`;
    // Classes passed to these functions are sorted too (component variants, conditional classes).
    config.tailwindFunctions = ["cn", "cva"];
  }
  return toJson(config);
}

function renderPrettierignore(mods) {
  const header = "# Géré par claude-kit : régénéré par /claude-kit:sync.";
  return [header, ...mods.flatMap((m) => m.prettierIgnores ?? [])].join("\n") + "\n";
}

function renderLintStaged(selected) {
  const ts = [
    selected.has("prettier") && "prettier --write",
    selected.has("eslint") && "eslint --fix",
  ].filter(Boolean);
  const out = {};
  if (ts.length) out["*.{ts,tsx,js,mjs}"] = ts;
  if (selected.has("prettier")) out["*.{css,md,json,yml,yaml}"] = ["prettier --write"];
  return out;
}

function replaceBlock(content, [begin, end], body) {
  const block = `${begin}\n${body}\n${end}`;
  const start = content.indexOf(begin);
  const stop = content.indexOf(end);
  if (start !== -1 && stop !== -1) {
    return content.slice(0, start) + block + content.slice(stop + end.length);
  }
  return content.replace(/\s*$/, "\n\n") + block + "\n";
}

function renderDependenciesDoc(pkg) {
  const section = (title, deps) => {
    const names = Object.keys(deps ?? {}).sort();
    if (!names.length) return "";
    const items = names.map((n) => `- **${n}** : ${DEP_DOCS[n] ?? "_à documenter_"}`);
    return `## \`${title}\`\n\n${items.join("\n")}\n`;
  };
  return [
    "# Dépendances",
    "",
    "Ce que fait chaque librairie du `package.json` et pourquoi elle est utilisée ici. À vérifier avant",
    "d'ajouter ou d'évaluer une nouvelle dépendance, et à tenir à jour dans la même PR que l'ajout.",
    "",
    section("dependencies", pkg.dependencies),
    section("devDependencies", pkg.devDependencies),
  ].join("\n");
}

function claudeMdSkeleton(vars) {
  return [
    "@AGENTS.md",
    "",
    "# CLAUDE.md",
    "",
    "Guidance pour Claude Code dans ce repo. Les conventions génériques (commandes, qualité, tests,",
    "workflow GitHub) viennent de claude-kit et sont importées en bas de ce fichier ; ce qui suit est",
    "propre au projet.",
    "",
    "## Projet",
    "",
    `<!-- ${vars.projectName} : but du projet, public, déploiement, contraintes (à compléter). -->`,
    "",
    "## Architecture",
    "",
    "<!-- Organisation de src/, sources de vérité, patterns à respecter (à compléter). -->",
    "",
  ].join("\n");
}

// Body of a kit block in a file, without the blank lines Prettier puts around it in Markdown;
// undefined when the file or the block is absent.
function blockBody(content, [begin, end]) {
  const start = content?.indexOf(begin) ?? -1;
  const stop = content?.indexOf(end) ?? -1;
  if (start === -1 || stop < start) return undefined;
  return content.slice(start + begin.length, stop).replace(/^\n+/, "").replace(/\n+$/, "");
}

// ---------------------------------------------------------------------------------------------
// Three-way sync (ADR 0008)

// Case of one element from its three versions, already normalized (N1); undefined = absent. F0 is
// an exact comparison, so that an action version raised by the kit is still written (F3); the
// other cases compare through `mask` (N2).
function syncCase({ base, project, kit }, mask = (text) => text) {
  if (project !== undefined && project === kit) return "F0";
  if (base === undefined) return project === undefined ? "F1" : "F2";
  if (project === undefined) return "F6";
  if (mask(project) === mask(base)) return "F3";
  return mask(kit) === mask(base) ? "F4" : "F5";
}

// What a sync does in each case, by kind of element (blocks follow managed files). F0, and a case
// absent from a row, leave the element alone.
const ACTIONS = {
  managed: { F1: "write", F2: "drift", F3: "write", F4: "drift", F5: "drift", F6: "drift" },
  seed: { F1: "write", F2: "propose", F3: "write", F5: "propose" },
  key: { F1: "write", F2: "conflict", F3: "write", F5: "conflict" },
};

// N2: in a managed workflow, the version of an action (`uses: owner/repo@v7`) is not a
// modification, and the kit writes the higher of its own and the project's. A ref that is not a
// version (SHA, branch) is left as is, so it counts as a modification.
const USES = /^([ \t]*(?:-[ \t]+)?uses:[ \t]*["']?)([^@\s"']+)@([^\s"'#]+)/gm;
const isWorkflow = (rel) => rel.startsWith(".github/workflows/");
const refVersion = (ref) => /^v?(\d+(?:\.\d+){0,2})$/.exec(ref)?.[1].split(".").map(Number);

function compareRefs(a, b) {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

function maskRefs(text) {
  return text.replace(USES, (line, head, action, ref) =>
    refVersion(ref) ? `${head}${action}@*` : line,
  );
}

function keepHigherRefs(kit, project) {
  const highest = new Map();
  for (const [, , action, ref] of project.matchAll(USES)) {
    const version = refVersion(ref);
    const best = highest.get(action);
    if (version && (!best || compareRefs(version, best.version) > 0)) {
      highest.set(action, { ref, version });
    }
  }
  return kit.replace(USES, (line, head, action, ref) => {
    const own = refVersion(ref);
    const theirs = highest.get(action);
    return own && theirs && compareRefs(theirs.version, own) > 0
      ? `${head}${action}@${theirs.ref}`
      : line;
  });
}

const asText = (value) => (value === undefined ? undefined : JSON.stringify(value));

function sortKeys(object) {
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
}

// ---------------------------------------------------------------------------------------------
// Apply

// Node 24 keeps a failed resolution for the whole process: a package missing at the first try
// (Prettier during `create`, installed after the first files are written) would never be found.
// So a package is only resolved once a node_modules of the project, or of a parent, has it.
function isInstalled(target, specifier) {
  const name = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
  for (let dir = path.resolve(target); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", name, "package.json"))) return true;
    if (dir === path.dirname(dir)) return false;
  }
}

async function loadProjectPrettier(target) {
  if (!isInstalled(target, "prettier")) return null;
  try {
    const require = createRequire(path.join(target, "package.json"));
    // createRequire resolves Prettier's CJS entry, whose API lives on the default export.
    const mod = await import(pathToFileURL(require.resolve("prettier")).href);
    return { api: mod.default ?? mod, require, target };
  } catch {
    return null;
  }
}

// Prettier resolves the plugins named in the config from the current directory, which is not the
// project during `create` or `apply <dir>`: every format would fail. Resolve them from the project,
// and keep getFileInfo from reading the config (and its plugins) again.
function resolvePlugin({ require, target }, plugin) {
  if (typeof plugin !== "string") return plugin;
  if (!/^[./]/.test(plugin) && !isInstalled(target, plugin)) return plugin;
  try {
    return require.resolve(plugin);
  } catch {
    return plugin;
  }
}

async function formatWith(prettier, file, content) {
  const { api } = prettier;
  try {
    const options = (await api.resolveConfig(file)) ?? {};
    const plugins = options.plugins?.map((plugin) => resolvePlugin(prettier, plugin));
    const info = await api.getFileInfo(file, { ignorePath: [], resolveConfig: false, plugins });
    if (!info.inferredParser) return content;
    return await api.format(content, { ...options, ...(plugins && { plugins }), filepath: file });
  } catch {
    return content;
  }
}

async function applyModules(target, mods, baseVars, { fresh, dryRun, install }) {
  const selected = new Set(mods.map((m) => m.id));
  const pkgPath = path.join(target, "package.json");
  if (!fs.existsSync(pkgPath)) throw new Error(`Pas de package.json dans ${target}`);
  let pkg = readJson(pkgPath);

  // V1: never sync with a kit older than the one that last wrote the project, dry-run included.
  const lockFile = path.join(target, LOCK_PATH);
  const previousLock = fs.existsSync(lockFile) ? readJson(lockFile) : null;
  if (previousLock && compareVersions(KIT_VERSION, previousLock.kitVersion) < 0) {
    throw new Error(
      `Le kit installé (${KIT_VERSION}) est plus ancien que celui du projet ` +
        `(${previousLock.kitVersion}, ${LOCK_PATH}) : mettre à jour le plugin claude-kit, puis relancer.`,
    );
  }
  // The base: what the kit rendered at the previous create or apply. Without it, a project with a
  // lock predates the base (A1: nothing absent is created); without a lock, it is being adopted (A2).
  const basePath = path.join(target, BASE_PATH);
  const base = fresh || !fs.existsSync(basePath) ? null : readJson(basePath);
  const bootstrap = fresh || base ? undefined : previousLock ? "A1" : "A2";

  const report = {
    kitVersion: KIT_VERSION,
    target,
    mode: fresh ? "create" : dryRun ? "dry-run" : "apply",
    ...(bootstrap && { bootstrap }),
    modules: [...selected],
    written: [],
    unchanged: [],
    drifts: [],
    proposals: [],
    conflicts: [],
    missing: [],
    installed: [],
    commands: [],
    checks: [],
    patches: [],
    unresolved: new Set(),
  };
  const vars = computeVars(mods, selected, baseVars, pkg.name);
  // Source root ("src/" or "" for app/ at the repo root): seed paths under `__src__/` and the
  // {{src}} var follow the project's layout instead of assuming create-next-app's --src-dir.
  vars.src ??= fresh || fs.existsSync(path.join(target, "src")) ? "src/" : "";
  const targetPath = (rel) => rel.replace(/^__src__[\\/]/, vars.src);
  // shadcn primitives library. New project: Base UI unless `--var uiBase=radix` (Base UI is
  // shadcn's current default). Existing project: whatever is installed, never switched.
  if (selected.has("tailwind-shadcn")) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const installed =
      "@base-ui/react" in deps
        ? "base"
        : Object.keys(deps).some((d) => d === "radix-ui" || d.startsWith("@radix-ui/"))
          ? "radix"
          : undefined;
    vars.uiBase ??= fresh ? "base" : (installed ?? "base");
    if (!["base", "radix"].includes(vars.uiBase)) {
      throw new Error(`uiBase doit valoir base ou radix (reçu : ${vars.uiBase})`);
    }
    if (installed && installed !== vars.uiBase) {
      report.conflicts.push({ field: "uiBase", current: installed, kit: vars.uiBase });
    }
    const radix = vars.uiBase === "radix";
    vars.uiLib = radix ? "Radix UI" : "Base UI";
    vars.uiDependency = radix ? "radix-ui" : "@base-ui/react";
    vars.uiForbidden = radix ? "@base-ui/react" : "radix-ui";
  }
  const render = makeRenderer({ vars, selected, report });
  const renderIf = (key) => render(`{{#if ${key}}}1{{/if}}`) === "1";
  // Copies for review: kit/<file> is what the kit would write, base/<file> what it wrote last time.
  const proposalsDir = path.join(os.tmpdir(), `claude-kit-proposals-${Date.now()}`);
  const keep = (side, rel, content) => {
    const file = path.join(proposalsDir, side, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };

  // Writes are staged, then flushed through the project's own Prettier (when installed): kit output
  // matches `format:check`, and a reformatting is never a modification (N1).
  let prettier = null;
  const normalize = async (rel, text) =>
    text === undefined || !prettier ? text : formatWith(prettier, path.join(target, rel), text);
  const nextBase = { files: {}, blocks: {}, packageJson: {}, merge: {} };
  const staged = [];
  // kind: managed | seed (compared to the base), block, fresh or direct (written as computed).
  const write = (relPath, content, kind = "managed") => {
    staged.push({ rel: relPath.split(path.sep).join("/"), content, kind });
  };
  const flush = async () => {
    prettier ??= await loadProjectPrettier(target);
    for (const item of staged.splice(0)) {
      if (item.kind === "managed" || item.kind === "seed") await syncFile(item);
      else if (item.kind === "block") await syncBlock(item);
      else commit(item.rel, await normalize(item.rel, item.content));
    }
  };
  const commit = (rel, content) => {
    const dest = path.join(target, rel);
    if (readIfExists(dest) === content) return report.unchanged.push(rel);
    report.written.push(rel);
    if (dryRun) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  };
  // Acts on the case of a file or block: write it, report a drift (managed) or a proposal (seed),
  // or leave it. `kit` and `base` are whole files.
  const settle = (kind, id, { rel, kit, base: recorded, block }) => {
    if (id === "F0") return report.unchanged.push(rel);
    const action = ACTIONS[kind][id];
    if (!action) return;
    const entry = { file: rel, ...(block && { block }), case: id };
    if (action === "write" && bootstrap === "A1") {
      return report.missing.push({ ...entry, case: "A1", proposal: keep("kit", rel, kit) });
    }
    if (action === "write") return commit(rel, kit);
    entry.proposal = keep("kit", rel, kit);
    if (recorded !== undefined) entry.base = keep("base", rel, recorded);
    (action === "drift" ? report.drifts : report.proposals).push(entry);
  };
  const syncFile = async ({ rel, content, kind }) => {
    const current = readIfExists(path.join(target, rel)) ?? undefined;
    const workflow = kind === "managed" && isWorkflow(rel);
    let kit = await normalize(rel, content);
    // The base keeps the kit's own action versions: a bump by the project (Dependabot) leaves it as is.
    nextBase.files[rel] = kit;
    if (workflow && current !== undefined) kit = keepHigherRefs(kit, current);
    if (fresh) return commit(rel, kit);
    const recorded = await normalize(rel, base?.files?.[rel]);
    const project = await normalize(rel, current);
    const id = syncCase({ base: recorded, project, kit }, workflow ? maskRefs : undefined);
    settle(kind, id, { rel, kit, base: recorded });
  };
  // A block is compared on its body, each version normalized inside the project's file.
  const syncBlock = async ({ rel, content: body, host }) => {
    const markers = markersFor(rel);
    const embed = async (text) =>
      text === undefined ? undefined : normalize(rel, replaceBlock(host, markers, text));
    const kit = await embed(body);
    nextBase.blocks[rel] = { body: blockBody(kit, markers), host };
    if (fresh) return commit(rel, kit);
    const recorded = await embed(base?.blocks?.[rel]);
    const current = readIfExists(path.join(target, rel)) ?? undefined;
    const project = await embed(blockBody(current, markers));
    const versions = [recorded, project, kit].map((file) => blockBody(file, markers));
    const id = syncCase({ base: versions[0], project: versions[1], kit: versions[2] });
    settle("managed", id, { rel, kit, base: recorded, block: "claude-kit" });
  };

  // 1. Module files.
  const fileBlocks = {};
  for (const mod of mods) {
    // `seed/` and `managed/`, plus conditional variants `seed@a+b/` copied only when every listed
    // module is selected (e.g. a11y's contrast test needs vitest + tailwind-shadcn). `fresh/` is
    // a seed written only by `create` (e.g. a numbered ADR that would collide in an existing repo).
    // `block/` holds the body of a kit block inside a file the project owns (see step 5c).
    for (const entry of fs.readdirSync(mod.dir)) {
      const match = /^(managed|seed|fresh|block)(?:@([\w+-]+))?$/.exec(entry);
      if (!match) continue;
      const [, kind, condition] = match;
      if (kind === "fresh" && !fresh) continue;
      if (condition && !condition.split("+").every((id) => selected.has(id))) continue;
      const dir = path.join(mod.dir, entry);
      for (const rel of walk(dir)) {
        const content = render(fs.readFileSync(path.join(dir, rel), "utf8"));
        if (kind === "block") (fileBlocks[targetPath(rel)] ??= []).push(content.trim());
        else write(targetPath(rel), content, kind);
      }
    }
    // merge/ keeps its union merge (M1); the base records the kit's contribution. A1 creates none.
    const mergeDir = path.join(mod.dir, "merge");
    for (const rel of walk(mergeDir)) {
      const incoming = JSON.parse(render(fs.readFileSync(path.join(mergeDir, rel), "utf8")));
      const recorded = nextBase.merge[rel];
      nextBase.merge[rel] = recorded ? deepMerge(recorded, incoming, true) : incoming;
      const current = readIfExists(path.join(target, rel));
      if (current === null && bootstrap === "A1") {
        report.missing.push({ file: rel, case: "A1", proposal: keep("kit", rel, toJson(incoming)) });
        continue;
      }
      const merged = current ? deepMerge(JSON.parse(current), incoming, fresh) : incoming;
      write(rel, toJson(merged), "direct");
    }
    const rules = path.join(mod.dir, "rules.md");
    if (fs.existsSync(rules)) {
      const header = `<!-- Géré par claude-kit (module ${mod.id}) : ne pas éditer, voir /claude-kit:sync. -->\n\n`;
      write(`.claude/kit/${mod.id}.md`, header + render(fs.readFileSync(rules, "utf8")));
    }
  }
  // Rules of modules that were deselected since the last run.
  const kitRulesDir = path.join(target, ".claude", "kit");
  for (const file of fs.existsSync(kitRulesDir) ? fs.readdirSync(kitRulesDir) : []) {
    if (file.endsWith(".md") && !selected.has(file.slice(0, -3)) && !dryRun) {
      fs.rmSync(path.join(kitRulesDir, file));
      report.written.push(`.claude/kit/${file} (supprimé)`);
    }
  }

  // 2. Composite files.
  if (selected.has("github-ci")) write(".github/workflows/ci.yml", renderCi(selected, vars));
  if (selected.has("prettier")) {
    write(".prettierrc.json", renderPrettierrc(selected, vars));
    write(".prettierignore", renderPrettierignore(mods));
  }
  // Volta projects pin Node in package.json (post command of `core`): no second source in .nvmrc.
  if (!vars.volta) write(".nvmrc", `${vars.nodeVersion}\n`, "seed");
  // Blocks are embedded in their file as it stands (`host`), the rest of the file being the project's.
  const gitignoreLines = mods.flatMap((m) => m.gitignore ?? []);
  if (gitignoreLines.length) {
    const host = readIfExists(path.join(target, ".gitignore")) ?? "";
    staged.push({ rel: ".gitignore", content: gitignoreLines.join("\n"), kind: "block", host });
  }
  const claudeMd = readIfExists(path.join(target, "CLAUDE.md"));
  const host = claudeMd && claudeMd.trim() !== "@AGENTS.md" ? claudeMd : claudeMdSkeleton(vars);
  const imports = mods
    .filter((m) => fs.existsSync(path.join(m.dir, "rules.md")))
    .map((m) => `@.claude/kit/${m.id}.md`);
  staged.push({ rel: "CLAUDE.md", content: imports.join("\n"), kind: "block", host });

  // 3. package.json: the keys the kit provides (type, scripts, lint-staged), each one compared to
  //    the base like a file. Written only when a key changes.
  let pkgChanged = false;
  const syncKey = (keyPath, value) => {
    const field = keyPath.join(".");
    const [head, sub] = keyPath;
    const current = sub === undefined ? pkg[head] : pkg[head]?.[sub];
    const set = () => {
      if (sub === undefined) pkg[head] = value;
      else (pkg[head] ??= {})[sub] = value;
      pkgChanged = true;
    };
    nextBase.packageJson[field] = value;
    if (fresh) return set();
    const recorded = base?.packageJson?.[field];
    const id = syncCase({ base: asText(recorded), project: asText(current), kit: asText(value) });
    const action = ACTIONS.key[id];
    if (action === "write" && bootstrap === "A1") {
      report.missing.push({ field, case: "A1", kit: value });
    } else if (action === "write") set();
    else if (action === "conflict") {
      const withBase = recorded === undefined ? {} : { base: recorded };
      report.conflicts.push({ field, case: id, ...withBase, current, kit: value });
    }
  };
  for (const mod of mods) {
    for (const [key, value] of Object.entries(mod.packageJson ?? {})) syncKey([key], value);
    for (const [key, value] of Object.entries(mod.scripts ?? {})) syncKey(["scripts", key], value);
  }
  if (selected.has("husky")) syncKey(["lint-staged"], renderLintStaged(selected));
  if (pkgChanged) write("package.json", toJson(pkg), "direct");
  await flush();

  // 4. Dependencies: only what is missing, at @latest (versions that come with Next are left to
  //    create-next-app, which pins mutually compatible ones).
  const present = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const wanted = mods.flatMap((m) => [
    ...(m.devDependencies ?? []),
    ...Object.entries(m.devDependenciesIf ?? {}).flatMap(([id, deps]) =>
      selected.has(id) ? deps : [],
    ),
  ]);
  const missing = [...new Set(wanted)].filter((dep) => !present.has(dep));
  if (missing.length) {
    report.installed = missing;
    if (install && !dryRun) run(`pnpm add -D ${missing.join(" ")}`, target);
  }

  // 5. Post-install commands. Those flagged `last` (formatting) run once every file is written.
  //    `if` = module/var condition; `unlessPackageField` = skip when package.json already has it
  //    (e.g. an existing Volta pin is the project's choice, never overwritten).
  const isGitRepo = fs.existsSync(path.join(target, ".git"));
  const posts = mods
    .flatMap((m) => (m.post ?? []).map((p) => ({ ...p, module: m.id })))
    .filter((p) => p.when === "always" || fresh)
    .filter((p) => !p.if || renderIf(p.if));
  const hasPackageField = (dotted) =>
    dotted.split(".").reduce((obj, key) => obj?.[key], readJson(pkgPath)) !== undefined;
  const runPosts = (list) => {
    for (const post of list) {
      const cmd = render(post.run);
      if (post.module === "husky" && !isGitRepo) {
        report.commands.push({ cmd, skipped: "pas de dépôt git" });
        continue;
      }
      if (post.unlessPackageField && hasPackageField(post.unlessPackageField)) {
        report.commands.push({ cmd, skipped: `${post.unlessPackageField} déjà défini` });
        continue;
      }
      report.commands.push({ cmd, skipped: dryRun || !install ? "dry-run/no-install" : undefined });
      if (!dryRun && install) run(cmd, target);
    }
  };
  runPosts(posts.filter((p) => !p.last));

  // 5a. create-next-app installs `@types/node` at its own major (^20), not Node's (ADR 0007). A new
  //     project is aligned; an existing one is only reported (`nodeTypes`), never modified.
  const nodeTypes = nodeTypesStatus(readJson(pkgPath), target, vars);
  if (nodeTypes) {
    report.nodeTypes = nodeTypes;
    if (nodeTypes.ok === false && fresh) {
      const cmd = `pnpm add -D @types/node@^${nodeTypes.nodeMajor}`;
      report.commands.push({ cmd, skipped: dryRun || !install ? "dry-run/no-install" : undefined });
      if (!dryRun && install) run(cmd, target);
    }
  }

  // 5b. Literal patches on files generated by post commands (e.g. shadcn's globals.css). A patch
  //     that no longer matches is reported, never guessed: the upstream default changed.
  for (const mod of mods) {
    for (const patch of mod.patches ?? []) {
      if ((patch.when === "fresh" && !fresh) || (patch.if && !renderIf(patch.if))) continue;
      const rel = render(patch.file);
      const file = path.join(target, rel);
      let content = readIfExists(file);
      const results = patch.replace.map(([from, to]) => {
        const applied = content !== null && content.includes(from);
        if (applied) content = content.replace(from, to);
        return { from: from.trim(), applied };
      });
      report.patches.push({ module: mod.id, file: rel, why: patch.why, results });
      if (content !== null && !dryRun) fs.writeFileSync(file, content);
    }
  }

  // 5c. Kit blocks in files the project owns (e.g. globals.css), once post commands have generated
  //     them. The file is the project's: a missing host is reported, never created.
  for (const [rel, bodies] of Object.entries(fileBlocks)) {
    const host = readIfExists(path.join(target, rel));
    if (host === null) report.missing.push({ file: rel, case: "H1", reason: "fichier hôte absent" });
    else staged.push({ rel, content: bodies.join("\n\n"), kind: "block", host });
  }

  // 6. Files that depend on the final package.json.
  pkg = readJson(pkgPath);
  if (selected.has("docs-adr")) write("docs/dependencies.md", renderDependenciesDoc(pkg), "seed");
  for (const mod of mods) {
    if (!mod.check) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const expect = Object.fromEntries(
      Object.entries(mod.check).map(([key, value]) => [key, render(value)]),
    );
    const ok = expect.dependency in deps && !(expect.forbidden in deps);
    report.checks.push({ module: mod.id, ok, expect });
  }

  await flush();

  // 7. Base and lock, written only when their content changes (V3), never in dry-run. The base
  //    holds the kit's render after the project's Prettier, which `create` only installs after the
  //    first writes: normalize again now.
  prettier ??= await loadProjectPrettier(target);
  const files = {};
  for (const rel of Object.keys(nextBase.files).sort()) {
    files[rel] = await normalize(rel, nextBase.files[rel]);
  }
  const blocks = {};
  for (const rel of Object.keys(nextBase.blocks).sort()) {
    const { body, host } = nextBase.blocks[rel];
    const file = await normalize(rel, replaceBlock(host, markersFor(rel), body));
    blocks[rel] = blockBody(file, markersFor(rel));
  }
  const packageJson = sortKeys(nextBase.packageJson);
  write(BASE_PATH, toJson({ files, blocks, packageJson, merge: sortKeys(nextBase.merge) }), "direct");
  // The UI library is recorded once chosen or detected, so later syncs never re-decide it; the
  // Node version too, so that an intact .nvmrc never follows a new default of the kit (ADR 0006).
  const lockVars = { ...baseVars };
  if (vars.uiBase) lockVars.uiBase = vars.uiBase;
  lockVars.nodeVersion ??= vars.nodeVersion;
  write(LOCK_PATH, toJson({ kitVersion: KIT_VERSION, modules: [...selected], vars: lockVars }), "direct");
  await flush();
  runPosts(posts.filter((p) => p.last));

  report.unresolved = [...report.unresolved];
  return report;
}

// ---------------------------------------------------------------------------------------------
// Commands

function cmdList() {
  const all = loadModules();
  const list = [...all.values()].map(({ dir: _dir, ...meta }) => ({
    id: meta.id,
    title: meta.title,
    description: meta.description,
    group: MANIFEST.groups[meta.group] ?? meta.group,
    default: Boolean(meta.default || meta.required),
    required: Boolean(meta.required),
    requires: meta.requires ?? [],
    vars: meta.vars ?? {},
  }));
  console.log(JSON.stringify({ kitVersion: KIT_VERSION, modules: list }, null, 2));
}

async function cmdCreate(args) {
  const [dirArg] = args._;
  if (!dirArg || !args.modules) throw new Error("Usage : create <dir> --modules a,b,c");
  const target = path.resolve(dirArg);
  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    throw new Error(`${target} existe et n'est pas vide`);
  }
  const all = loadModules();
  const mods = resolveSelection(all, args.modules);
  const selected = new Set(mods.map((m) => m.id));
  const flags = [
    "--ts",
    "--app",
    "--src-dir",
    '--import-alias "@/*"',
    "--use-pnpm",
    "--yes",
    "--disable-git",
    selected.has("eslint") ? "--eslint" : "--no-eslint",
    ...[...all.values()].flatMap((m) =>
      selected.has(m.id) ? (m.createFlags ?? []) : (m.createFlagsIfAbsent ?? []),
    ),
  ];
  if (args["react-compiler"]) flags.push("--react-compiler");
  run(`pnpm create next-app@latest "${target}" ${flags.join(" ")}`, path.dirname(target));
  run("git init -q -b main", target);

  const report = await applyModules(target, mods, args.vars, {
    fresh: true,
    dryRun: false,
    install: true,
  });
  printReport(report);
}

async function cmdApply(args) {
  const target = path.resolve(args._[0] ?? ".");
  const all = loadModules();
  let requested = args.modules;
  let vars = args.vars;
  if (args["from-lock"]) {
    const lockFile = path.join(target, LOCK_PATH);
    if (!fs.existsSync(lockFile)) throw new Error(`Pas de ${LOCK_PATH} dans ${target}`);
    const lock = readJson(lockFile);
    requested = lock.modules;
    vars = { ...lock.vars, ...args.vars };
  }
  if (!requested) throw new Error("Usage : apply <dir> --modules a,b,c | --from-lock");
  requested = [...requested, ...args.add].filter((id) => !args.remove.includes(id));
  const mods = resolveSelection(all, requested);
  const report = await applyModules(target, mods, vars, {
    fresh: false,
    dryRun: Boolean(args["dry-run"]),
    install: !args["no-install"],
  });
  printReport(report);
}

function printReport(report) {
  console.log("\n--- claude-kit report ---");
  console.log(JSON.stringify(report, null, 2));
}

// Importable by the tests (test/): the command only runs when the file is the entry point.
export {
  deepMerge,
  makeRenderer,
  renderCi,
  parseArgs,
  resolveSelection,
  loadModules,
  applyModules,
  loadProjectPrettier,
  nodeTypesStatus,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args._.splice(0, 1);
  try {
    if (command === "list") cmdList();
    else if (command === "create") await cmdCreate(args);
    else if (command === "apply") await cmdApply(args);
    else {
      console.error("Commandes : list | create <dir> --modules … | apply <dir> --modules …|--from-lock");
      process.exit(1);
    }
  } catch (error) {
    console.error(`claude-kit: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
