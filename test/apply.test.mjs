import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  applyModules,
  deepMerge,
  loadModules,
  loadProjectPrettier,
  makeRenderer,
  nodeRuntimeStatus,
  nodeTypesStatus,
  renderCi,
  resolveSelection,
} from "../scripts/apply.mjs";
import { FAKES, KIT_ROOT, copyFixture, tmpDir } from "./helpers.mjs";

const render = (text, { vars = {}, selected = [] } = {}) => {
  const report = { unresolved: new Set() };
  const out = makeRenderer({ vars, selected: new Set(selected), report })(text);
  return { out, unresolved: [...report.unresolved] };
};

test("gabarit : {{var}} remplacée, inconnue laissée et signalée", () => {
  const { out, unresolved } = render("a {{x}} b {{y}}", { vars: { x: "1" } });
  assert.equal(out, "a 1 b {{y}}");
  assert.deepEqual(unresolved, ["y"]);
});

test("gabarit : {{#if}} évalué sur module sélectionné ou variable vraie", () => {
  const text = "{{#if a}}A{{/if}}|{{#if v}}V{{/if}}|{{#if w}}W{{/if}}";
  const { out } = render(text, { vars: { v: "1", w: "" }, selected: ["a"] });
  assert.equal(out, "A|V|");
});

test("gabarit : {{#if a+b}} exige que toutes les parties soient vraies", () => {
  const text = "{{#if a+b}}X{{/if}}";
  assert.equal(render(text, { selected: ["a", "b"] }).out, "X");
  assert.equal(render(text, { selected: ["a"] }).out, "");
});

test("deepMerge : union des tableaux sans doublon", () => {
  assert.deepEqual(deepMerge({ k: [1, 2] }, { k: [2, 3] }, false), { k: [1, 2, 3] });
});

test("deepMerge : fusion récursive, existant gagne sauf preferIncoming", () => {
  const existing = { a: { b: 1, c: 2 } };
  const incoming = { a: { b: 9, d: 4 } };
  assert.deepEqual(deepMerge(existing, incoming, false), { a: { b: 1, c: 2, d: 4 } });
  assert.deepEqual(deepMerge(existing, incoming, true), { a: { b: 9, c: 2, d: 4 } });
});

test("renderCi : une étape par module sélectionné, dans l'ordre", () => {
  const ci = renderCi(new Set(["core", "github-ci", "eslint", "vitest"]), {});
  const steps = [...ci.matchAll(/- run: pnpm (?!install)(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(steps, ["typecheck", "lint:ci", "test", "build"]);
});

test("renderCi : Playwright ajoute l'installation du navigateur et test:e2e", () => {
  const ci = renderCi(new Set(["core", "github-ci", "playwright"]), {});
  assert.match(ci, /playwright install --with-deps chromium/);
  assert.match(ci, /- run: pnpm test:e2e/);
});

test("renderCi : Node lu dans package.json avec Volta, .nvmrc sinon", () => {
  const selected = new Set(["core", "github-ci"]);
  assert.match(renderCi(selected, { volta: "1" }), /node-version-file: package\.json/);
  assert.match(renderCi(selected, {}), /node-version-file: \.nvmrc/);
});

// Les variantes du ci.yml qui changent les permissions ou les jobs.
const CI_BASE = ["core", "github-ci", "prettier", "eslint", "vitest", "playwright", "a11y"];
const VERCEL = { vercelCheckName: "Vercel - demo: ci" };
const CI_VARIANTS = {
  standard: { selected: CI_BASE, vars: {} },
  "vercel-check": { selected: [...CI_BASE, "vercel-check"], vars: VERCEL },
  "a11yGate=advisory": { selected: CI_BASE, vars: { a11yGate: "advisory" } },
  // Deux jobs dans le workflow qui porte le statut Vercel (#77, ADR 0010).
  "vercel-check + a11yGate=advisory": {
    selected: [...CI_BASE, "vercel-check"],
    vars: { ...VERCEL, a11yGate: "advisory" },
  },
};
// Le mode par défaut (.nvmrc) : `run=volta` est déprécié et garde son propre test ci-dessus.
const renderVariant = ({ selected, vars }) => renderCi(new Set(selected), vars);

// Découpe le ci.yml en jobs : { nom: texte du job }.
const ciJobs = (ci) =>
  Object.fromEntries(
    ci
      .split("\njobs:\n")[1]
      .split(/\n(?=  [\w-]+:\n)/)
      .map((block) => [block.match(/^  ([\w-]+):/m)[1], block]),
  );

// Mettre à jour après un changement voulu : node --test --test-update-snapshots "test/*.test.mjs"
for (const [name, variant] of Object.entries(CI_VARIANTS)) {
  test(`renderCi : instantané du ci.yml (${name})`, (t) => {
    t.assert.snapshot(renderVariant(variant), { serializers: [(v) => v] });
  });
}

// Une étape d'un job rendu, repérée par son nom : texte, et script de `run: |` désindenté.
function ciStep(jobText, name) {
  const steps = jobText.split(/\n(?= {6}- )/).slice(1);
  const index = steps.findIndex((s) => s.includes(`- name: ${name}\n`));
  assert.notEqual(index, -1, `étape « ${name} » absente`);
  const text = steps[index];
  const run = text.split("run: |\n")[1] ?? "";
  const script = run
    .split("\n")
    .filter((l) => l.startsWith(" ".repeat(10)))
    .map((l) => l.slice(10))
    .join("\n");
  return { index, count: steps.length, text, script };
}

test("renderCi : statuses: write sur build ssi vercel-check, jamais actions: read", () => {
  for (const [name, variant] of Object.entries(CI_VARIANTS)) {
    const vercel = variant.selected.includes("vercel-check");
    const jobs = ciJobs(renderVariant(variant));
    assert.equal(/^ {6}statuses: write$/m.test(jobs.build), vercel, name);
    for (const [job, text] of Object.entries(jobs)) {
      assert.doesNotMatch(text, /actions: read/, `${name} : job ${job}`);
      if (job === "build") continue;
      assert.doesNotMatch(text, /statuses|VERCEL_CHECK/, `${name} : job ${job}`);
    }
  }
});

// L'action Vercel jugeait le premier job du run, quel qu'il soit (#77) : le job build pose son
// propre statut, en attente avant tout, puis à l'état du job en dernière étape, même après un
// échec.
test("renderCi : vercel-check, statut posé par le job build lui-même (ADR 0010)", () => {
  for (const name of ["vercel-check", "vercel-check + a11yGate=advisory"]) {
    const ci = renderVariant(CI_VARIANTS[name]);
    assert.doesNotMatch(ci, /repository-dispatch/, name);
    const { build } = ciJobs(ci);
    assert.match(build, /^ {4}env:\n {6}VERCEL_CHECK: "Vercel - demo: ci"$/m, name);
    const pending = ciStep(build, "Statut Vercel (en cours)");
    assert.equal(pending.index, 0, `${name} : statut en attente avant toute autre étape`);
    const result = ciStep(build, "Statut Vercel (résultat du job)");
    assert.equal(result.index, result.count - 1, `${name} : résultat en dernière étape`);
    assert.match(result.text, /^ {8}if: always\(\)$/m, name);
    assert.match(result.text, /^ {10}JOB_STATUS: \$\{\{ job\.status \}\}$/m, name);
    for (const step of [pending, result]) {
      assert.match(step.text, /GH_TOKEN: \$\{\{ github\.token \}\}/, name);
    }
  }
});

// Lance un script d'étape rendu avec le faux gh et l'environnement d'un runner (VERCEL_CHECK lu
// dans le job rendu) ; renvoie les appels reçus par gh.
function runStatusScript(script, env) {
  const dir = tmpDir();
  const log = path.join(dir, "gh.log");
  fs.writeFileSync(log, "");
  const result = spawnSync("bash", ["-e", "-c", script], {
    encoding: "utf8",
    env: {
      PATH: `${FAKES}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_SCENARIO: JSON.stringify({ "api repos/demo/app/statuses/": {} }),
      GITHUB_REPOSITORY: "demo/app",
      GITHUB_SHA: "0123abc",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_RUN_ID: "42",
      GH_TOKEN: "jeton",
      ...env,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const field = (call, key) => call.find((arg) => arg.startsWith(`${key}=`));

test("renderCi : vercel-check, seul un job réussi pose success", () => {
  const { build } = ciJobs(renderVariant(CI_VARIANTS["vercel-check + a11yGate=advisory"]));
  const VERCEL_CHECK = build.match(/^ {6}VERCEL_CHECK: "(.*)"$/m)[1];
  const [pending] = runStatusScript(ciStep(build, "Statut Vercel (en cours)").script, {
    VERCEL_CHECK,
  });
  assert.equal(pending[1], "repos/demo/app/statuses/0123abc");
  assert.equal(field(pending, "state"), "state=pending");
  assert.equal(field(pending, "context"), "context=Vercel - demo: ci");
  const result = ciStep(build, "Statut Vercel (résultat du job)").script;
  const expected = { success: "success", failure: "failure", cancelled: "failure", "": "failure" };
  for (const [jobStatus, state] of Object.entries(expected)) {
    const calls = runStatusScript(result, { VERCEL_CHECK, JOB_STATUS: jobStatus });
    assert.equal(calls.length, 1, `job.status=${jobStatus}`);
    assert.equal(calls[0][1], "repos/demo/app/statuses/0123abc");
    assert.equal(field(calls[0], "state"), `state=${state}`, `job.status=${jobStatus}`);
    assert.equal(field(calls[0], "context"), "context=Vercel - demo: ci");
  }
});

test("renderCi : chaque job a un délai maximum", () => {
  for (const [name, variant] of Object.entries(CI_VARIANTS)) {
    const jobs = ciJobs(renderVariant(variant));
    assert.ok(Object.keys(jobs).length > 0, name);
    for (const [job, text] of Object.entries(jobs)) {
      assert.match(text, /^ {4}timeout-minutes: \d+$/m, `${name} : job ${job}`);
    }
  }
});

test("renderCi : navigateurs Playwright en cache avant chaque installation", () => {
  for (const [name, variant] of Object.entries(CI_VARIANTS)) {
    for (const [job, text] of Object.entries(ciJobs(renderVariant(variant)))) {
      if (!text.includes("playwright install")) continue;
      const cache = text.indexOf("path: ~/.cache/ms-playwright");
      assert.ok(cache !== -1, `${name} : job ${job} sans cache`);
      assert.ok(cache < text.indexOf("playwright install"), `${name} : job ${job}`);
      assert.match(text, /key: playwright-.*steps\.playwright\.outputs\.version/);
    }
  }
});

test("resolveSelection : core toujours présent, dépendances ajoutées, ordre du manifeste", () => {
  const all = loadModules();
  const ids = resolveSelection(all, ["github-ci"]).map((m) => m.id);
  assert.equal(ids[0], "core");
  assert.ok(ids.includes("github-ci"));
  assert.throws(() => resolveSelection(all, ["inconnu"]), /Module inconnu/);
});

// ---------------------------------------------------------------------------------------------
// Sync à trois voies : un test par cas de l'ADR 0008 (base B, projet P, kit K).

const LOCK = ".claude/kit.lock.json";
const BASE = ".claude/kit/base.json";
const CI = ".github/workflows/ci.yml";
const TSCONFIG = "tsconfig.json";
const VARS = { owner: "TwelveLab12", boardNumber: "1" };
// Rendu d'une version précédente du kit : base et projet qui diffèrent du rendu actuel.
const OLD = "# rendu d'une version précédente du kit\n";

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const readJsonIn = (dir, rel) => JSON.parse(read(dir, rel));
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
function writeIn(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}
function editJson(dir, rel, edit) {
  const value = readJsonIn(dir, rel);
  edit(value);
  writeIn(dir, rel, JSON.stringify(value, null, 2) + "\n");
}
// Fichier et cas de chaque entrée du rapport, sans les chemins des propositions.
const cases = (entries) => entries.map(({ file, case: id }) => ({ file, case: id }));

async function applyFromLock(dir, options = {}) {
  const lock = readJsonIn(dir, LOCK);
  const mods = resolveSelection(loadModules(), lock.modules);
  return applyModules(dir, mods, lock.vars, { fresh: false, dryRun: false, install: false, ...options });
}

// Projet équipé par le kit (lock et base), sans create-next-app : `create` sur un package.json nu.
async function createProject(modules = ["core", "github-ci"]) {
  const dir = copyFixture("sample");
  fs.rmSync(path.join(dir, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"));
  const mods = resolveSelection(loadModules(), modules);
  await applyModules(dir, mods, VARS, { fresh: true, dryRun: false, install: false });
  return dir;
}

// Le Prettier du projet (faux : il retire les espaces en fin de ligne), avec un plugin installé dans
// le projet et absent du dossier courant, comme prettier-plugin-tailwindcss pendant `create`.
function installFakePrettier(dir) {
  fs.cpSync(path.join(KIT_ROOT, "test/fakes/prettier"), path.join(dir, "node_modules/prettier"), {
    recursive: true,
  });
  writeIn(dir, "node_modules/fake-prettier-plugin/package.json", '{ "name": "fake-prettier-plugin" }\n');
  writeIn(dir, "node_modules/fake-prettier-plugin/index.js", "module.exports = {};\n");
  writeIn(dir, ".prettierrc.json", '{ "plugins": ["fake-prettier-plugin"] }\n');
}

// Pendant `create`, Prettier est absent au premier essai et installé ensuite. Node 24 garde en cache
// une résolution qui a échoué : il ne faut pas chercher un paquet avant qu'il soit installé.
test("Prettier installé en cours de passage : trouvé malgré un premier essai sans lui", async () => {
  const dir = copyFixture("sample");
  fs.mkdirSync(path.join(dir, "node_modules/autre"), { recursive: true });
  assert.equal(await loadProjectPrettier(dir), null);
  installFakePrettier(dir);
  assert.ok(await loadProjectPrettier(dir));
});

// #73 : sans tailwindStylesheet, le plugin ignore les tokens @theme du projet (bg-card rangé en
// tête) ; sans tailwindFunctions, il ne trie pas les classes passées à cn() et cva().
const PRETTIERRC = ".prettierrc.json";
const PRETTIER_BASE = { semi: true, singleQuote: false, printWidth: 100 };

test("Prettier : avec tailwind-shadcn, feuille du projet et fonctions cn/cva déclarées", async () => {
  const dir = await createProject(["core", "prettier", "tailwind-shadcn"]);
  assert.deepEqual(readJsonIn(dir, PRETTIERRC), {
    ...PRETTIER_BASE,
    plugins: ["prettier-plugin-tailwindcss"],
    tailwindStylesheet: "./src/app/globals.css",
    tailwindFunctions: ["cn", "cva"],
  });
  assert.deepEqual((await applyFromLock(dir)).written, []);
});

test("Prettier : la feuille suit le projet dont app/ est à la racine", async () => {
  // Projet existant sans base (adoption) : le fichier est proposé, pas écrit.
  const dir = copyFixture("sample");
  const mods = resolveSelection(loadModules(), ["core", "prettier", "tailwind-shadcn"]);
  const report = await applyModules(dir, mods, VARS, { fresh: false, dryRun: false, install: false });
  const { proposal } = report.missing.find(({ file }) => file === PRETTIERRC);
  assert.equal(JSON.parse(fs.readFileSync(proposal, "utf8")).tailwindStylesheet, "./app/globals.css");
});

test("Prettier : sans tailwind-shadcn, ni plugin ni option Tailwind", async () => {
  const dir = await createProject(["core", "prettier"]);
  assert.deepEqual(readJsonIn(dir, PRETTIERRC), PRETTIER_BASE);
});

test("N1 : un fichier reformaté par le projet n'est pas un écart", async () => {
  const dir = await createProject();
  installFakePrettier(dir);
  writeIn(dir, CI, read(dir, CI).replace(/\n/g, "  \n"));
  const report = await applyFromLock(dir);
  assert.deepEqual([report.written, report.drifts], [[], []]);
});

test("N2 : une action montée par le projet n'est pas un écart et n'est pas redescendue", async () => {
  const dir = await createProject();
  writeIn(dir, CI, read(dir, CI).replace("actions/checkout@v7", "actions/checkout@v8"));
  const report = await applyFromLock(dir);
  assert.match(read(dir, CI), /actions\/checkout@v8/);
  assert.deepEqual([report.written, report.drifts], [[], []]);
});

test("N2 : une action montée par le kit est écrite, la plus haute des deux versions gagne", async () => {
  const dir = await createProject();
  // Le kit passe checkout de v6 à v7 ; Dependabot a monté setup-node en v9 dans le projet.
  const previous = read(dir, CI).replace("actions/checkout@v7", "actions/checkout@v6");
  editJson(dir, BASE, (base) => (base.files[CI] = previous));
  writeIn(dir, CI, previous.replace("actions/setup-node@v7", "actions/setup-node@v9"));
  const report = await applyFromLock(dir);
  assert.ok(report.written.includes(CI));
  assert.match(read(dir, CI), /actions\/checkout@v7/);
  assert.match(read(dir, CI), /actions\/setup-node@v9/);
  assert.deepEqual(report.drifts, []);
});

test("N2 : une référence SHA est un écart", async () => {
  const dir = await createProject();
  writeIn(dir, CI, read(dir, CI).replace("actions/checkout@v7", `actions/checkout@${"a".repeat(40)}`));
  const before = read(dir, CI);
  const report = await applyFromLock(dir);
  assert.equal(read(dir, CI), before);
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F4" }]);
});

test("F0 : un projet identique au kit → rien n'est écrit", async () => {
  const dir = await createProject();
  // Mêmes clés, autre mise en forme : package.json n'est pas réécrit pour autant.
  writeIn(dir, "package.json", JSON.stringify(readJsonIn(dir, "package.json")));
  const report = await applyFromLock(dir);
  assert.deepEqual(report.written, []);
  assert.deepEqual([report.drifts, report.proposals, report.conflicts, report.missing], [[], [], [], []]);
});

test("F1 : un élément nouveau dans le kit → fichier écrit, clé ajoutée", async () => {
  const dir = await createProject();
  // Absents de la base et du projet : comme un fichier ou un script que le kit vient d'ajouter.
  for (const rel of [".gitattributes", TSCONFIG]) fs.rmSync(path.join(dir, rel));
  editJson(dir, "package.json", (pkg) => delete pkg.scripts.typegen);
  editJson(dir, BASE, (base) => {
    delete base.files[".gitattributes"];
    delete base.files[TSCONFIG];
    delete base.packageJson["scripts.typegen"];
  });
  const report = await applyFromLock(dir);
  for (const rel of [".gitattributes", TSCONFIG]) assert.ok(report.written.includes(rel), rel);
  assert.equal(readJsonIn(dir, "package.json").scripts.typegen, "next typegen");
});

test("F2 : sans base, un élément présent qui diffère → managed signalé, seed proposé, clé en conflit", async () => {
  const dir = await createProject();
  writeIn(dir, CI, "# ci du projet\n");
  writeIn(dir, TSCONFIG, '{ "projet": true }\n');
  editJson(dir, "package.json", (pkg) => (pkg.scripts.typecheck = "tsc --noEmit"));
  editJson(dir, BASE, (base) => {
    delete base.files[CI];
    delete base.files[TSCONFIG];
    delete base.packageJson["scripts.typecheck"];
  });
  const report = await applyFromLock(dir);
  assert.equal(read(dir, CI), "# ci du projet\n");
  assert.equal(read(dir, TSCONFIG), '{ "projet": true }\n');
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F2" }]);
  assert.match(fs.readFileSync(report.drifts[0].proposal, "utf8"), /^name: CI$/m);
  assert.deepEqual(cases(report.proposals), [{ file: TSCONFIG, case: "F2" }]);
  assert.deepEqual(report.conflicts, [
    { field: "scripts.typecheck", case: "F2", current: "tsc --noEmit", kit: "next typegen && tsc --noEmit" },
  ]);
});

test("F3 : un élément intact, le kit a changé → fichier réécrit, clé mise à jour", async () => {
  const dir = await createProject();
  const kitCi = read(dir, CI);
  for (const rel of [CI, TSCONFIG]) writeIn(dir, rel, OLD);
  editJson(dir, "package.json", (pkg) => (pkg.scripts.typecheck = "tsc"));
  editJson(dir, BASE, (base) => {
    base.files[CI] = OLD;
    base.files[TSCONFIG] = OLD;
    base.packageJson["scripts.typecheck"] = "tsc";
  });
  const report = await applyFromLock(dir);
  assert.equal(read(dir, CI), kitCi);
  assert.notEqual(read(dir, TSCONFIG), OLD);
  assert.equal(readJsonIn(dir, "package.json").scripts.typecheck, "next typegen && tsc --noEmit");
  assert.deepEqual([report.drifts, report.proposals, report.conflicts], [[], [], []]);
});

test("F4 : managed modifié, kit inchangé → écart signalé, fichier intact ; seed ou clé modifiés → rien", async () => {
  const dir = await createProject();
  const kitCi = read(dir, CI);
  writeIn(dir, CI, kitCi.replace("contents: read", "contents: read\n      actions: read"));
  writeIn(dir, TSCONFIG, '{ "perso": true }\n');
  editJson(dir, "package.json", (pkg) => (pkg.scripts.typecheck = "tsc --noEmit"));
  const before = read(dir, CI);
  const report = await applyFromLock(dir);
  assert.equal(read(dir, CI), before);
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F4" }]);
  assert.equal(fs.readFileSync(report.drifts[0].proposal, "utf8"), kitCi);
  assert.equal(read(dir, TSCONFIG), '{ "perso": true }\n');
  assert.equal(readJsonIn(dir, "package.json").scripts.typecheck, "tsc --noEmit");
  assert.deepEqual([report.written, report.proposals, report.conflicts], [[], [], []]);
});

test("F5 : modifié des deux côtés → écart ou proposition, rien d'écrasé ; le conflit de clé montre B, P et K", async () => {
  const dir = await createProject();
  const kitTsconfig = read(dir, TSCONFIG);
  writeIn(dir, CI, "# ci du projet\n");
  writeIn(dir, TSCONFIG, '{ "perso": true }\n');
  editJson(dir, "package.json", (pkg) => (pkg.scripts.typecheck = "tsc --noEmit"));
  editJson(dir, BASE, (base) => {
    base.files[CI] = OLD;
    base.files[TSCONFIG] = OLD;
    base.packageJson["scripts.typecheck"] = "tsc";
  });
  const report = await applyFromLock(dir);
  assert.equal(read(dir, CI), "# ci du projet\n");
  assert.equal(read(dir, TSCONFIG), '{ "perso": true }\n');
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F5" }]);
  assert.deepEqual(cases(report.proposals), [{ file: TSCONFIG, case: "F5" }]);
  // base/ et kit/ montrent ce que le kit a changé, sans deviner.
  const [proposal] = report.proposals;
  assert.equal(fs.readFileSync(proposal.base, "utf8"), OLD);
  assert.equal(fs.readFileSync(proposal.proposal, "utf8"), kitTsconfig);
  assert.deepEqual(report.conflicts, [
    {
      field: "scripts.typecheck",
      case: "F5",
      base: "tsc",
      current: "tsc --noEmit",
      kit: "next typegen && tsc --noEmit",
    },
  ]);
});

test("F6 : supprimé par le projet → pas recréé, le managed est signalé", async () => {
  const dir = await createProject();
  for (const rel of [CI, TSCONFIG]) fs.rmSync(path.join(dir, rel));
  editJson(dir, "package.json", (pkg) => delete pkg.scripts.typecheck);
  const report = await applyFromLock(dir);
  for (const rel of [CI, TSCONFIG]) assert.ok(!exists(dir, rel), rel);
  assert.equal(readJsonIn(dir, "package.json").scripts.typecheck, undefined);
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F6" }]);
  assert.deepEqual([report.written, report.proposals, report.conflicts], [[], [], []]);
});

test("bloc : intact, il suit le kit (F3, module ajouté) ; modifié par le projet, il est signalé (F4)", async () => {
  const dir = await createProject();
  const withEslint = resolveSelection(loadModules(), ["core", "github-ci", "eslint"]);
  await applyModules(dir, withEslint, readJsonIn(dir, LOCK).vars, {
    fresh: false,
    dryRun: false,
    install: false,
  });
  assert.match(read(dir, "CLAUDE.md"), /^@\.claude\/kit\/eslint\.md$/m);
  writeIn(dir, "CLAUDE.md", read(dir, "CLAUDE.md").replace("@.claude/kit/core.md", "@docs/perso.md"));
  const report = await applyFromLock(dir);
  assert.match(read(dir, "CLAUDE.md"), /^@docs\/perso\.md$/m);
  assert.deepEqual(report.drifts.map(({ file, block, case: id }) => ({ file, block, case: id })), [
    { file: "CLAUDE.md", block: "claude-kit", case: "F4" },
  ]);
});

// Projet shadcn minimal (globals.css du projet, sans create-next-app) équipé par `create`.
const GLOBALS = "src/app/globals.css";
// L'anneau couvre aussi les cibles focalisées par script (#59).
const FOCUS = /:where\([^)]*\[tabindex="-1"\][^)]*\):focus-visible \{\s*outline: 3px solid var\(--ring\);/;
async function createShadcnProject(globals = '@import "tailwindcss";\n:root { --ring: oklch(0.556 0 0); }\n') {
  const dir = copyFixture("sample");
  fs.rmSync(path.join(dir, ".claude"), { recursive: true });
  if (globals !== null) writeIn(dir, GLOBALS, globals);
  const mods = resolveSelection(loadModules(), ["core", "tailwind-shadcn", "a11y"]);
  await applyModules(dir, mods, VARS, { fresh: true, dryRun: false, install: false });
  return dir;
}

test("a11y : l'anneau :focus-visible global est écrit dans globals.css, le reste du fichier est intact", async () => {
  const dir = await createShadcnProject();
  const css = read(dir, GLOBALS);
  assert.match(css, FOCUS);
  assert.match(css, /^:root \{ --ring: oklch\(0\.556 0 0\); \}$/m);
  assert.deepEqual((await applyFromLock(dir)).written, []);
});

test("a11y : un projet existant reçoit l'anneau au sync (written), puis plus rien (written: [])", async () => {
  const dir = await createShadcnProject();
  // Projet d'avant le bloc : ni le bloc dans le fichier, ni son entrée dans la base.
  writeIn(dir, GLOBALS, '@import "tailwindcss";\n/* perso */\n');
  editJson(dir, BASE, (base) => delete base.blocks[GLOBALS]);
  const report = await applyFromLock(dir);
  assert.deepEqual(report.written, [GLOBALS, BASE]);
  assert.match(read(dir, GLOBALS), /\/\* perso \*\//);
  assert.match(read(dir, GLOBALS), FOCUS);
  assert.deepEqual((await applyFromLock(dir)).written, []);
});

test("a11y : un anneau modifié par le projet n'est pas écrasé, il est signalé", async () => {
  const dir = await createShadcnProject();
  writeIn(dir, GLOBALS, read(dir, GLOBALS).replace("3px solid", "4px solid"));
  const report = await applyFromLock(dir);
  assert.match(read(dir, GLOBALS), /4px solid/);
  assert.deepEqual(report.written, []);
  assert.deepEqual(
    report.drifts.map(({ file, block, case: id }) => ({ file, block, case: id })),
    [{ file: GLOBALS, block: "claude-kit", case: "F4" }],
  );
});

test("a11y : sans globals.css, rien n'est créé et l'absence est signalée", async () => {
  const dir = await createShadcnProject(null);
  assert.equal(exists(dir, GLOBALS), false);
  const report = await applyFromLock(dir);
  assert.equal(exists(dir, GLOBALS), false);
  assert.deepEqual(report.missing, [{ file: GLOBALS, case: "H1", reason: "fichier hôte absent" }]);
});

test("M1 : la contribution de merge/ est dans la base, la fusion reste celle d'avant", async () => {
  const dir = await createProject(["core", "claude-settings"]);
  const settings = ".claude/settings.json";
  editJson(dir, settings, (s) => s.permissions.allow.push("Bash(make *)"));
  await applyFromLock(dir);
  const { allow } = readJsonIn(dir, settings).permissions;
  assert.ok(allow.includes("Bash(make *)") && allow.includes("Bash(pnpm *)"));
  const contribution = readJsonIn(dir, BASE).merge[settings].permissions.allow;
  assert.ok(contribution.includes("Bash(pnpm *)") && !contribution.includes("Bash(make *)"));
});

test("V1 : un kit plus ancien que le lock est refusé, dry-run compris", async () => {
  const dir = copyFixture("sample");
  editJson(dir, LOCK, (lock) => (lock.kitVersion = "99.0.0"));
  for (const dryRun of [true, false]) {
    await assert.rejects(applyFromLock(dir, { dryRun }), /plus ancien que celui du projet \(99\.0\.0/);
  }
  assert.ok(!exists(dir, BASE));
  assert.equal(readJsonIn(dir, LOCK).kitVersion, "99.0.0");
});

test("V2 : un sync avec la même version que le lock est permis", async () => {
  const dir = await createProject();
  const { version } = JSON.parse(read(KIT_ROOT, ".claude-plugin/plugin.json"));
  assert.equal(readJsonIn(dir, LOCK).kitVersion, version);
  assert.equal((await applyFromLock(dir)).mode, "apply");
});

test("V3 : un second sync n'écrit rien, lock et base compris ; le lock n'a plus de date", async () => {
  const dir = copyFixture("sample");
  const first = await applyFromLock(dir);
  assert.ok(first.written.includes(LOCK) && first.written.includes(BASE));
  assert.ok(!("updatedAt" in readJsonIn(dir, LOCK)));
  assert.deepEqual((await applyFromLock(dir)).written, []);
});

test("A1 : lock sans base → rien d'écrasé ni de créé, absents signalés, base écrite", async () => {
  const dir = copyFixture("sample");
  editJson(dir, LOCK, (lock) => lock.modules.push("claude-settings"));
  writeIn(dir, CI, "# ci du projet\n");
  const report = await applyFromLock(dir);
  assert.equal(report.bootstrap, "A1");
  assert.equal(read(dir, CI), "# ci du projet\n");
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F2" }]);
  for (const rel of [".gitattributes", TSCONFIG, ".claude/kit/core.md", ".claude/settings.json"]) {
    assert.ok(!exists(dir, rel), rel);
    assert.ok(report.missing.some((m) => m.file === rel && m.proposal), rel);
  }
  assert.ok(report.missing.some((m) => m.file === "CLAUDE.md" && m.block === "claude-kit"));
  assert.ok(report.missing.some((m) => m.field === "scripts.typegen"));
  assert.equal(readJsonIn(dir, "package.json").scripts.typegen, undefined);
  assert.deepEqual(report.written, [BASE, LOCK]);
});

test("A2 : sans lock, les fichiers absents sont écrits, les fichiers existants jamais écrasés", async () => {
  const dir = copyFixture("sample");
  fs.rmSync(path.join(dir, ".claude"), { recursive: true });
  writeIn(dir, CI, "# ci du projet\n");
  writeIn(dir, TSCONFIG, '{ "projet": true }\n');
  const mods = resolveSelection(loadModules(), ["core", "github-ci"]);
  const report = await applyModules(dir, mods, VARS, { fresh: false, dryRun: false, install: false });
  assert.equal(report.bootstrap, "A2");
  assert.equal(read(dir, CI), "# ci du projet\n");
  assert.equal(read(dir, TSCONFIG), '{ "projet": true }\n');
  assert.deepEqual(cases(report.drifts), [{ file: CI, case: "F2" }]);
  assert.deepEqual(cases(report.proposals), [{ file: TSCONFIG, case: "F2" }]);
  for (const rel of [".gitattributes", ".claude/kit/core.md", "CLAUDE.md", LOCK, BASE]) {
    assert.ok(exists(dir, rel), rel);
  }
  assert.equal(readJsonIn(dir, "package.json").scripts.typegen, "next typegen");
});

test("lock : nodeVersion inscrit à la création et au premier sync, s'il manque", async () => {
  const { nodeVersion } = JSON.parse(read(KIT_ROOT, "modules/manifest.json")).defaults;
  assert.equal(readJsonIn(await createProject(), LOCK).vars.nodeVersion, nodeVersion);
  const dir = copyFixture("sample");
  await applyFromLock(dir);
  assert.equal(readJsonIn(dir, LOCK).vars.nodeVersion, nodeVersion);
});

test("apply : --dry-run n'écrit rien, ni base ni lock", async () => {
  const dir = copyFixture("sample");
  fs.rmSync(path.join(dir, ".claude"), { recursive: true });
  const mods = resolveSelection(loadModules(), ["core", "github-ci"]);
  const report = await applyModules(dir, mods, VARS, { fresh: false, dryRun: true, install: false });
  assert.ok(report.written.includes(CI) && report.written.includes(BASE));
  for (const rel of [".github", ".claude"]) assert.ok(!exists(dir, rel), rel);
});

test("apply.mjs en ligne de commande : list renvoie le catalogue", () => {
  const out = execFileSync("node", [path.join(KIT_ROOT, "scripts/apply.mjs"), "list"], {
    encoding: "utf8",
  });
  assert.ok(JSON.parse(out).modules.some((m) => m.id === "core"));
});

test("nodeTypesStatus : la majeure de Node vient de volta.node, sinon .nvmrc, sinon du kit", () => {
  const dir = copyFixture("sample");
  const pkg = { devDependencies: { "@types/node": "^20.19.0" } };
  const vars = { nodeVersion: "24" };
  assert.equal(nodeTypesStatus({}, dir, vars), null);
  const kit = nodeTypesStatus(pkg, dir, vars);
  assert.deepEqual([kit.source, kit.nodeMajor, kit.ok], ["nodeVersion du kit", "24", false]);
  fs.writeFileSync(path.join(dir, ".nvmrc"), "v22.1.0\n");
  const nvmrc = nodeTypesStatus(pkg, dir, vars);
  assert.deepEqual([nvmrc.source, nvmrc.nodeMajor, nvmrc.ok], [".nvmrc", "22", false]);
  const volta = nodeTypesStatus({ ...pkg, volta: { node: "20.19.0" } }, dir, vars);
  assert.deepEqual([volta.source, volta.nodeMajor, volta.ok], ["volta.node", "20", true]);
});

test("nodeTypesStatus : un alias de version de Node donne ok: null, jamais la version du kit", () => {
  const dir = copyFixture("sample");
  const pkg = { devDependencies: { "@types/node": "^20.19.0" } };
  fs.writeFileSync(path.join(dir, ".nvmrc"), "lts/iron\n");
  const alias = nodeTypesStatus(pkg, dir, { nodeVersion: "24" });
  assert.deepEqual([alias.source, alias.nodeMajor, alias.ok], [".nvmrc", null, null]);
  // Aucune majeure connue, ni pour Node ni pour les types : indéterminé, pas « aligné ».
  fs.rmSync(path.join(dir, ".nvmrc"));
  const latest = { devDependencies: { "@types/node": "latest" } };
  assert.equal(nodeTypesStatus(latest, dir, { nodeVersion: "lts/*" }).ok, null);
});

test("nodeRuntimeStatus : le Node qui exécute est comparé à .nvmrc, ou à volta.node", () => {
  const dir = copyFixture("sample");
  // Rien de déclaré : aucune comparaison, pas même avec le défaut du kit.
  assert.equal(nodeRuntimeStatus({}, dir, "26.13.1"), null);
  fs.writeFileSync(path.join(dir, ".nvmrc"), "24\n");
  const gap = nodeRuntimeStatus({}, dir, "26.13.1");
  assert.deepEqual(gap, { source: ".nvmrc", nodeMajor: "24", running: "26", ok: false });
  assert.equal(nodeRuntimeStatus({}, dir, "v24.22.3").ok, true);
  const volta = nodeRuntimeStatus({ volta: { node: "22.1.0" } }, dir, "24.22.3");
  assert.deepEqual([volta.source, volta.nodeMajor, volta.ok], ["volta.node", "22", false]);
  fs.writeFileSync(path.join(dir, ".nvmrc"), "lts/*\n");
  assert.equal(nodeRuntimeStatus({}, dir, "26.13.1").ok, null);
});

// Le Node des tests varie (lts/* en CI) : les majeures attendues partent de celui qui tourne.
test("sync : le Node qui exécute le sync est comparé à .nvmrc, l'écart signalé sans rien écrire", async () => {
  const running = process.versions.node.split(".")[0];
  const other = String(Number(running) + 1);
  const dir = copyFixture("sample");
  const mods = resolveSelection(loadModules(), ["core"]);
  const options = { dryRun: false, install: false };
  const vars = { nodeVersion: other };
  const created = await applyModules(dir, mods, vars, { fresh: true, ...options });
  assert.equal(created.nodeRuntime, undefined);
  const synced = await applyModules(dir, mods, vars, { fresh: false, ...options });
  assert.deepEqual(synced.nodeRuntime, { source: ".nvmrc", nodeMajor: other, running, ok: false });
  assert.ok(!synced.written.includes(".nvmrc"));
  fs.writeFileSync(path.join(dir, ".nvmrc"), `${running}\n`);
  const aligned = await applyModules(dir, mods, vars, { fresh: false, ...options });
  assert.equal(aligned.nodeRuntime.ok, true);
});

test("run=volta : déprécié, signalé par le rapport, toujours géré", async () => {
  for (const [run, deprecated] of [
    ["volta", ["run=volta"]],
    ["pnpm", undefined],
  ]) {
    const dir = copyFixture("sample");
    const mods = resolveSelection(loadModules(), ["core"]);
    const options = { fresh: false, dryRun: true, install: false };
    const report = await applyModules(dir, mods, { run }, options);
    assert.deepEqual(report.deprecated, deprecated);
  }
});

// La majeure de Volta (22) diffère du défaut du kit (24) : le test prouve qu'elle est lue.
for (const [run, source, major] of [
  ["pnpm", ".nvmrc", "24"],
  ["volta", "volta.node", "22"],
]) {
  test(`create (${run}) : @types/node suit ${source}, le sync signale sans modifier`, async () => {
    const dir = copyFixture("sample");
    const file = path.join(dir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.devDependencies = { "@types/node": "^20" };
    if (run === "volta") pkg.volta = { node: "22.1.0" };
    fs.writeFileSync(file, JSON.stringify(pkg));
    const mods = resolveSelection(loadModules(), ["core"]);
    const options = { dryRun: false, install: false };
    const created = await applyModules(dir, mods, { run }, { fresh: true, ...options });
    const { nodeTypes } = created;
    assert.deepEqual([nodeTypes.source, nodeTypes.nodeMajor, nodeTypes.ok], [source, major, false]);
    assert.ok(created.commands.some((c) => c.cmd === `pnpm add -D @types/node@^${major}`));
    // Projet existant : signalé, jamais modifié.
    const synced = await applyModules(dir, mods, { run }, { fresh: false, ...options });
    assert.equal(synced.nodeTypes.ok, false);
    assert.ok(!synced.commands.some((c) => c.cmd.includes("@types/node")));
  });
}

test("dependabot.yml ignore les bumps majeurs de @types/node", () => {
  const yml = fs.readFileSync(
    path.join(KIT_ROOT, "modules/dependabot/managed/.github/dependabot.yml"),
    "utf8",
  );
  assert.match(yml, /dependency-name: "@types\/node"\s+update-types: \["version-update:semver-major"\]/);
});

test("dependabot.yml ne pose que des labels créés par labels.json", () => {
  const yml = read(KIT_ROOT, "modules/dependabot/managed/.github/dependabot.yml");
  const used = [...yml.matchAll(/^ +labels:\n((?: +- .+\n)+)/gm)].flatMap((block) =>
    [...block[1].matchAll(/- "?([^"\n]+)"?/g)].map((m) => m[1]),
  );
  // Une entrée conditionnelle (`if`) n'est créée qu'avec son module : Dependabot ne peut pas y compter.
  const created = readJsonIn(KIT_ROOT, "modules/github-workflow/labels.json")
    .filter((label) => !label.if)
    .map((label) => label.name);
  assert.ok(used.length > 0);
  for (const label of used) assert.ok(created.includes(label), `label ${label} absent de labels.json`);
});

// Baseline (core.md) et template de PR rendus contre le ci.yml rendu, pour plusieurs combinaisons
// de modules : la baseline avant la PR couvre chaque étape de la CI.
const BASELINE_COMBOS = {
  "tous les outils": ["prettier", "eslint", "vitest", "playwright"],
  "sans prettier": ["eslint", "vitest", "playwright"],
  "sans vitest": ["prettier", "eslint", "playwright"],
  "sans playwright": ["prettier", "eslint", "vitest"],
  "ni outil ni test": [],
};
const scriptsIn = (text) => [...text.matchAll(/`pnpm ([\w:]+)`/g)].map((m) => m[1]);
// Un script de la baseline couvre lui-même, les scripts qu'il lance (`pnpm build`) et ceux qu'il
// relance en mode CI (`CI=1 playwright test` = `test:e2e`).
const coveredBy = (scripts, name) => {
  const script = scripts[name] ?? "";
  const runs = [...script.matchAll(/\bpnpm (?:run )?([\w:]+)/g)].map((m) => m[1]);
  const asCi = Object.keys(scripts).filter((key) => script.includes(`CI=1 ${scripts[key]} `));
  return [name, ...runs, ...asCi];
};

for (const [name, tools] of Object.entries(BASELINE_COMBOS)) {
  test(`baseline : dérivée des étapes de la CI (${name})`, async () => {
    const dir = await createProject(["core", "github-ci", "github-workflow", ...tools]);
    const ciSteps = [...ciJobs(read(dir, CI)).build.matchAll(/- run: pnpm (?!install|exec)(\S+)/g)]
      .map((m) => m[1]);
    const core = read(dir, ".claude/kit/core.md");
    const commit = scriptsIn(core.match(/^- Avant chaque commit : (.+)$/m)[1]);
    const pr = scriptsIn(core.match(/^- Avant d'ouvrir une PR : (.+)$/m)[1]);
    // `build` vient de create-next-app, absent du projet d'exemple.
    const scripts = { build: "next build", ...readJsonIn(dir, "package.json").scripts };

    assert.deepEqual(commit, ciSteps.filter((step) => step !== "build" && step !== "test:e2e"));
    assert.deepEqual(pr.slice(0, commit.length), commit);
    const covered = pr.flatMap((script) => coveredBy(scripts, script));
    for (const step of ciSteps) assert.ok(covered.includes(step), `étape ${step} absente de la baseline`);
    for (const script of pr) assert.ok(script in scripts, `script ${script} absent de package.json`);
    const template = read(dir, ".github/pull_request_template.md");
    assert.deepEqual(scriptsIn(template.match(/^- \[ \] Baseline avant la PR.+$/m)[0]), pr);
  });
}
