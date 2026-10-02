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
//   managed/  owned by the kit: always (re)written, never edit it in the project.
//   seed/     owned by the project once created: written on `create` or when missing; otherwise
//             only compared, and a rendered proposal is written to a temp dir for review.
//   merge/    JSON deep-merged into the project's file (arrays are unioned).
//   rules.md  Claude rules, written to .claude/kit/<module>.md and imported from CLAUDE.md.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = path.join(KIT_ROOT, "modules");
const KIT_VERSION = readJson(path.join(KIT_ROOT, ".claude-plugin", "plugin.json")).version;
const MANIFEST = readJson(path.join(MODULES_DIR, "manifest.json"));
const DEP_DOCS = readJson(path.join(MODULES_DIR, "dependencies.json"));
const LOCK_PATH = ".claude/kit.lock.json";
const CLAUDE_BLOCK = ["<!-- BEGIN:claude-kit -->", "<!-- END:claude-kit -->"];
const GITIGNORE_BLOCK = ["# >>> claude-kit", "# <<< claude-kit"];

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
  const checks = ["typecheck", has("eslint") && "lint:ci", has("vitest") && "test", "build"];
  vars.baselineChecks = joinFr(checks.filter(Boolean).map((s) => `\`${vars.run} ${s}\``));
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

function renderCi(selected, vars) {
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
    "    permissions:",
    "      contents: read",
  ];
  if (selected.has("vercel-check")) lines.push("      statuses: write");
  lines.push("    steps:", "      - uses: actions/checkout@v7", "");
  if (selected.has("vercel-check")) {
    lines.push(
      "      # Reports this job's status to Vercel as a named Deployment Check",
      "      # (Settings > Deployment Checks in the Vercel dashboard).",
      "      - uses: vercel/repository-dispatch/actions/status@v1",
      "        with:",
      `          name: "${vars.vercelCheckName}"`,
      "",
    );
  }
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
  const playwrightReport = (name) => [
    "",
    "      - uses: actions/upload-artifact@v5",
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
      lines.push("", "      - run: pnpm exec playwright install --with-deps chromium");
      lines.push("", `      - run: pnpm test:e2e${advisory ? " --grep-invert @a11y" : ""}`);
    } else lines.push("", `      - run: pnpm ${step}`);
  }
  if (selected.has("playwright")) lines.push(...playwrightReport("playwright-report"));

  if (advisory) {
    lines.push(
      "",
      "  # Accessibilité sur le rendu (e2e/a11y.spec.ts) : informatif, ne bloque ni le merge ni la",
      "  # mise en production tant que la dette existante n'est pas résorbée (voir l'ADR de stratégie",
      "  # accessibilité). Le rendre bloquant : retirer la variable a11yGate du lock, puis sync.",
      "  a11y:",
      "    runs-on: ubuntu-latest",
      "    continue-on-error: true",
      "    permissions:",
      "      contents: read",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "",
      ...setup,
      "",
      "      - run: pnpm exec playwright install --with-deps chromium",
      "",
      "      - run: pnpm build",
      "",
      "      - run: pnpm test:e2e --grep @a11y",
      ...playwrightReport("a11y-report"),
    );
  }
  return lines.join("\n") + "\n";
}

function renderPrettierrc(selected) {
  const config = { semi: true, singleQuote: false, printWidth: 100 };
  if (selected.has("tailwind-shadcn")) config.plugins = ["prettier-plugin-tailwindcss"];
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

// ---------------------------------------------------------------------------------------------
// Apply

async function loadProjectPrettier(target) {
  try {
    const require = createRequire(path.join(target, "package.json"));
    // createRequire resolves Prettier's CJS entry, whose API lives on the default export.
    const mod = await import(pathToFileURL(require.resolve("prettier")).href);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function formatWith(prettier, file, content) {
  try {
    const info = await prettier.getFileInfo(file, { ignorePath: [] });
    if (!info.inferredParser) return content;
    const options = (await prettier.resolveConfig(file)) ?? {};
    return await prettier.format(content, { ...options, filepath: file });
  } catch {
    return content;
  }
}

async function applyModules(target, mods, baseVars, { fresh, dryRun, install }) {
  const selected = new Set(mods.map((m) => m.id));
  const pkgPath = path.join(target, "package.json");
  if (!fs.existsSync(pkgPath)) throw new Error(`Pas de package.json dans ${target}`);
  let pkg = readJson(pkgPath);

  const report = {
    kitVersion: KIT_VERSION,
    target,
    mode: fresh ? "create" : dryRun ? "dry-run" : "apply",
    modules: [...selected],
    written: [],
    unchanged: [],
    seedDiffers: [],
    conflicts: [],
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
  const render = makeRenderer({ vars, selected, report });
  const renderIf = (key) => render(`{{#if ${key}}}1{{/if}}`) === "1";
  const proposalsDir = path.join(os.tmpdir(), `claude-kit-proposals-${Date.now()}`);

  // Writes are staged, then flushed through the project's own Prettier (when installed) so that
  // kit output matches `format:check` and a re-run with nothing new reports everything unchanged.
  const staged = [];
  const write = (relPath, content, kind = "managed") => {
    staged.push({ rel: relPath.split(path.sep).join("/"), content, kind });
  };
  const flush = async () => {
    const prettier = await loadProjectPrettier(target);
    for (const { rel, content, kind } of staged.splice(0)) {
      commit(rel, prettier ? await formatWith(prettier, path.join(target, rel), content) : content, kind);
    }
  };
  const commit = (rel, content, kind) => {
    const dest = path.join(target, rel);
    const current = readIfExists(dest);
    if (current === content) return report.unchanged.push(rel);
    if (kind === "seed" && current !== null && !fresh) {
      const proposal = path.join(proposalsDir, rel);
      fs.mkdirSync(path.dirname(proposal), { recursive: true });
      fs.writeFileSync(proposal, content);
      return report.seedDiffers.push({ file: rel, proposal });
    }
    report.written.push(rel);
    if (dryRun) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  };

  // 1. Module files.
  for (const mod of mods) {
    // `seed/` and `managed/`, plus conditional variants `seed@a+b/` copied only when every listed
    // module is selected (e.g. a11y's contrast test needs vitest + tailwind-shadcn). `fresh/` is
    // a seed written only by `create` (e.g. a numbered ADR that would collide in an existing repo).
    for (const entry of fs.readdirSync(mod.dir)) {
      const match = /^(managed|seed|fresh)(?:@([\w+-]+))?$/.exec(entry);
      if (!match) continue;
      const [, kind, condition] = match;
      if (kind === "fresh" && !fresh) continue;
      if (condition && !condition.split("+").every((id) => selected.has(id))) continue;
      const dir = path.join(mod.dir, entry);
      for (const rel of walk(dir)) {
        const content = render(fs.readFileSync(path.join(dir, rel), "utf8"));
        write(targetPath(rel), content, kind === "managed" ? "managed" : "seed");
      }
    }
    const mergeDir = path.join(mod.dir, "merge");
    for (const rel of walk(mergeDir)) {
      const incoming = JSON.parse(render(fs.readFileSync(path.join(mergeDir, rel), "utf8")));
      const current = readIfExists(path.join(target, rel));
      const merged = current ? deepMerge(JSON.parse(current), incoming, fresh) : incoming;
      write(rel, toJson(merged));
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
    write(".prettierrc.json", renderPrettierrc(selected));
    write(".prettierignore", renderPrettierignore(mods));
  }
  // Volta projects pin Node in package.json (post command of `core`): no second source in .nvmrc.
  if (!vars.volta) write(".nvmrc", `${vars.nodeVersion}\n`, "seed");
  const gitignoreLines = mods.flatMap((m) => m.gitignore ?? []);
  if (gitignoreLines.length) {
    const current = readIfExists(path.join(target, ".gitignore")) ?? "";
    write(".gitignore", replaceBlock(current, GITIGNORE_BLOCK, gitignoreLines.join("\n")));
  }
  const claudeMd = readIfExists(path.join(target, "CLAUDE.md"));
  const base = claudeMd && claudeMd.trim() !== "@AGENTS.md" ? claudeMd : claudeMdSkeleton(vars);
  const imports = mods
    .filter((m) => fs.existsSync(path.join(m.dir, "rules.md")))
    .map((m) => `@.claude/kit/${m.id}.md`);
  write("CLAUDE.md", replaceBlock(base, CLAUDE_BLOCK, imports.join("\n")));

  // 3. package.json: scripts + lint-staged (existing values win outside `create`).
  const setField = (field, key, value) => {
    pkg[field] ??= {};
    const current = pkg[field][key];
    if (current === undefined || fresh) pkg[field][key] = value;
    else if (JSON.stringify(current) !== JSON.stringify(value)) {
      report.conflicts.push({ field: `${field}.${key}`, current, kit: value });
    }
  };
  for (const mod of mods) {
    for (const [key, value] of Object.entries(mod.packageJson ?? {})) {
      if (pkg[key] === undefined || fresh) pkg[key] = value;
      else if (JSON.stringify(pkg[key]) !== JSON.stringify(value)) {
        report.conflicts.push({ field: key, current: pkg[key], kit: value });
      }
    }
    for (const [key, value] of Object.entries(mod.scripts ?? {})) setField("scripts", key, value);
  }
  if (selected.has("husky")) {
    const lintStaged = renderLintStaged(selected);
    if (fresh || !pkg["lint-staged"]) pkg["lint-staged"] = lintStaged;
    else if (JSON.stringify(pkg["lint-staged"]) !== JSON.stringify(lintStaged)) {
      report.conflicts.push({ field: "lint-staged", current: pkg["lint-staged"], kit: lintStaged });
    }
  }
  write("package.json", toJson(pkg));
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

  // 6. Files that depend on the final package.json.
  pkg = readJson(pkgPath);
  if (selected.has("docs-adr")) write("docs/dependencies.md", renderDependenciesDoc(pkg), "seed");
  for (const mod of mods) {
    if (!mod.check) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const ok = mod.check.dependency in deps && !(mod.check.forbidden in deps);
    report.checks.push({ module: mod.id, ok, expect: mod.check });
  }

  // 7. Lock file.
  const lock = {
    kitVersion: KIT_VERSION,
    modules: [...selected],
    vars: baseVars,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  write(LOCK_PATH, toJson(lock));
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
