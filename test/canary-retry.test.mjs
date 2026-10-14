import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithFakeGh } from "./helpers.mjs";

const RUN_URL = "https://github.com/o/r/actions/runs/123";
const ARGS = ["--repo", "o/r", "--run-id", "123", "--url", RUN_URL, "--poll-seconds", "0"];

const retry = (attempt, scenario) =>
  runWithFakeGh("canary-retry.mjs", [...ARGS, "--attempt", String(attempt)], scenario);

// La relance (tentative 2) terminée avec cette conclusion, et les issues ouvertes trouvées.
const scenario = (conclusion, openIssues = []) => ({
  "run rerun": {},
  "api repos/o/r/actions/runs/123": {
    stdout: JSON.stringify({ run_attempt: 2, status: "completed", conclusion }),
  },
  "issue list": { stdout: JSON.stringify(openIssues) },
  "issue comment": {},
  "issue create": {},
});

const issueCalls = (calls) => calls.filter((c) => c[0] === "issue" && c[1] !== "list");

test("canary : premier échec → relance, relance verte → rien d'autre", () => {
  const r = retry(1, scenario("success"));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls[0], ["run", "rerun", "123", "--repo", "o/r"]);
  assert.deepEqual(issueCalls(r.calls), []);
  assert.deepEqual(JSON.parse(r.stdout), { action: "rerun", conclusion: "success" });
});

test("canary : relance en échec, issue déjà ouverte → un commentaire, pas de nouvelle issue", () => {
  const open = [{ number: 42, title: "Canary en échec (2026-10-05)" }];
  const r = retry(1, scenario("failure", open));
  assert.equal(r.status, 0, r.stderr);
  const calls = issueCalls(r.calls);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 5), ["issue", "comment", "42", "--repo", "o/r"]);
  assert.ok(calls[0].at(-1).includes(RUN_URL));
});

test("canary : relance en échec, aucune issue « Canary en échec » ouverte → ouvre l'issue", () => {
  // La recherche GitHub peut renvoyer une issue qui ne fait que citer le canary.
  const open = [{ number: 7, title: "Kit : le canary en échec ne relance pas" }];
  const r = retry(1, scenario("timed_out", open));
  assert.equal(r.status, 0, r.stderr);
  const calls = issueCalls(r.calls);
  assert.equal(calls.length, 1);
  const create = calls[0];
  assert.equal(create[1], "create");
  assert.equal(create[create.indexOf("--title") + 1], "Canary en échec");
  assert.equal(create[create.indexOf("--label") + 1], "chore");
  assert.ok(create[create.indexOf("--body") + 1].includes(RUN_URL));
});

test("canary : run déjà relancé → aucun appel gh", () => {
  // Scénario vide : tout appel à gh échoue au lieu de boucler sur l'attente.
  const r = retry(2, {});
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, []);
});

test("canary : argument manquant → erreur sans appeler gh", () => {
  const r = runWithFakeGh("canary-retry.mjs", ["--repo", "o/r"], scenario("failure"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--run-id, --attempt, --url/);
  assert.deepEqual(r.calls, []);
});
