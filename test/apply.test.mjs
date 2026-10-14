import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  applyModules,
  deepMerge,
  loadModules,
  makeRenderer,
  renderCi,
  resolveSelection,
} from "../scripts/apply.mjs";
import { KIT_ROOT, copyFixture } from "./helpers.mjs";

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

// Les trois variantes du ci.yml qui changent les permissions ou les jobs.
const CI_BASE = ["core", "github-ci", "prettier", "eslint", "vitest", "playwright", "a11y"];
const CI_VARIANTS = {
  standard: { selected: CI_BASE, vars: {} },
  "vercel-check": {
    selected: [...CI_BASE, "vercel-check"],
    vars: { vercelCheckName: "Vercel - demo: ci" },
  },
  "a11yGate=advisory": { selected: CI_BASE, vars: { a11yGate: "advisory" } },
};
const renderVariant = ({ selected, vars }) => renderCi(new Set(selected), { volta: "1", ...vars });

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

test("renderCi : actions: read si et seulement si vercel-check est actif", () => {
  for (const [name, variant] of Object.entries(CI_VARIANTS)) {
    const vercel = variant.selected.includes("vercel-check");
    assert.equal(/^ {6}actions: read$/m.test(renderVariant(variant)), vercel, name);
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

async function applyFromLock(dir, options = {}) {
  const lock = JSON.parse(fs.readFileSync(path.join(dir, ".claude/kit.lock.json"), "utf8"));
  const mods = resolveSelection(loadModules(), lock.modules);
  return applyModules(dir, mods, lock.vars, { fresh: false, dryRun: false, install: false, ...options });
}

test("apply --from-lock : écrit les fichiers gérés, puis un second passage est idempotent", async () => {
  const dir = copyFixture("sample");
  const first = await applyFromLock(dir);
  assert.ok(first.written.includes(".github/workflows/ci.yml"));
  assert.ok(fs.existsSync(path.join(dir, ".github/workflows/ci.yml")));
  const second = await applyFromLock(dir);
  assert.deepEqual(second.written, []);
});

test("apply : un fichier géré modifié à la main est réécrit", async () => {
  const dir = copyFixture("sample");
  await applyFromLock(dir);
  const ci = path.join(dir, ".github/workflows/ci.yml");
  fs.writeFileSync(ci, "# bidouillé\n");
  const report = await applyFromLock(dir);
  assert.ok(report.written.includes(".github/workflows/ci.yml"));
  assert.match(fs.readFileSync(ci, "utf8"), /name: CI/);
});

test("apply : un fichier seed personnalisé n'est pas écrasé, une proposition est produite", async () => {
  const dir = copyFixture("sample");
  await applyFromLock(dir);
  const tsconfig = path.join(dir, "tsconfig.json");
  fs.writeFileSync(tsconfig, '{ "perso": true }\n');
  const report = await applyFromLock(dir);
  assert.equal(fs.readFileSync(tsconfig, "utf8"), '{ "perso": true }\n');
  assert.ok(report.seedDiffers.some((d) => d.file === "tsconfig.json"));
});

test("apply : --dry-run n'écrit rien", async () => {
  const dir = copyFixture("sample");
  const report = await applyFromLock(dir, { dryRun: true });
  assert.ok(report.written.length > 0);
  assert.ok(!fs.existsSync(path.join(dir, ".github")));
});

test("apply.mjs en ligne de commande : list renvoie le catalogue", () => {
  const out = execFileSync("node", [path.join(KIT_ROOT, "scripts/apply.mjs"), "list"], {
    encoding: "utf8",
  });
  assert.ok(JSON.parse(out).modules.some((m) => m.id === "core"));
});
