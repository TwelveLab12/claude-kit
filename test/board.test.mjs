import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithFakeGh } from "./helpers.mjs";

const URL = "https://github.com/o/r/issues/1";

const STATUS_FIELD = {
  fields: [
    {
      name: "Status",
      id: "F1",
      options: [
        { id: "O1", name: "Backlog" },
        { id: "O2", name: "À faire" },
        { id: "O3", name: "En cours" },
      ],
    },
  ],
};
const happy = {
  "project item-add": { stdout: JSON.stringify({ id: "ITEM" }) },
  "project view": { stdout: JSON.stringify({ id: "PROJ" }) },
  "project field-list": { stdout: JSON.stringify(STATUS_FIELD) },
  "project item-edit": {},
};

const board = (args, scenario) => runWithFakeGh("board.mjs", args, scenario);

test("board add --status doing : ajoute l'item puis fixe « En cours »", () => {
  const r = board(["add", URL, "--status", "doing", "--owner", "o", "--project", "4"], happy);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    ok: true,
    owner: "o",
    project: "4",
    url: URL,
    itemId: "ITEM",
    status: "En cours",
  });
  const edit = r.calls.find((c) => c[1] === "item-edit");
  assert.ok(edit.includes("O3") && edit.includes("ITEM") && edit.includes("PROJ"));
});

test("board add sans --status : n'édite pas le statut", () => {
  const r = board(["add", URL, "--owner", "o", "--project", "4"], happy);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, null);
  assert.ok(!r.calls.some((c) => c[1] === "item-edit"));
});

test("board : statut inconnu → erreur qui liste les statuts disponibles", () => {
  const r = board(["status", URL, "Inexistant", "--owner", "o", "--project", "4"], happy);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /introuvable.*Backlog, À faire, En cours/);
});

test("board : scope `project` manquant → message qui indique la commande à lancer", () => {
  const r = board(["add", URL, "--owner", "o", "--project", "4"], {
    "project item-add": { stderr: "error: required scopes [project]", code: 1 },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /gh auth refresh -s project/);
});

test("board : owner ou board inconnus → erreur sans appeler gh", () => {
  const r = board(["add", URL], happy);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--owner et --project/);
  assert.equal(r.calls.length, 0);
});
