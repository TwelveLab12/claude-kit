#!/usr/bin/env node
// claude-kit — GitHub Project (board) helper, so nobody has to juggle GraphQL node ids.
//
//   node board.mjs init   --repo <owner/name> [--title <board title>]
//   node board.mjs add    <issue-or-pr-url> [--status <name>]
//   node board.mjs status <issue-or-pr-url> <status name>
//
// One board per repository (TwelveLab12 convention). Owner, project number and status names
// default to the project's .claude/kit.lock.json vars (owner, boardNumber, statusBacklog/
// statusTodo/statusDoing/statusDone); override with --owner / --project.
// Status may also be given as backlog | todo | doing | done.
// Needs a gh token with the `project` scope: `gh auth refresh -s project`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";

function gh(args, input) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (stderr.includes("required scopes")) {
      throw new Error("le token gh n'a pas le scope `project` : lancer `gh auth refresh -s project`");
    }
    throw new Error(stderr.trim() || error.message);
  }
}

const ghJson = (args) => JSON.parse(gh([...args, "--format", "json"]));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

const lockVars = fs.existsSync(".claude/kit.lock.json")
  ? (JSON.parse(fs.readFileSync(".claude/kit.lock.json", "utf8")).vars ?? {})
  : {};
const args = parseArgs(process.argv.slice(2));
const [command, url, statusArg] = args._;
const owner = args.owner ?? lockVars.owner ?? args.repo?.split("/")[0];
const project = args.project ?? lockVars.boardNumber;

// Board columns, in order. Backlog parks issues without commitment; new issues land in "todo".
const STATUSES = [
  {
    key: "backlog",
    name: lockVars.statusBacklog ?? "Backlog",
    color: "PURPLE",
    description:
      "Gardé en mémoire, sans engagement : attend un prérequis ou du recul. Passer en « À faire » une fois décidé.",
  },
  { key: "todo", name: lockVars.statusTodo ?? "À faire", color: "GRAY", description: "" },
  { key: "doing", name: lockVars.statusDoing ?? "En cours", color: "YELLOW", description: "" },
  { key: "done", name: lockVars.statusDone ?? "Terminé", color: "GREEN", description: "" },
];
const aliases = Object.fromEntries(STATUSES.map((s) => [s.key, s.name]));

// Built-in project workflows have no public API: they are enabled by hand in the board settings.
const WORKFLOWS_TO_ENABLE = [
  "Item added to project → statut « À faire »",
  "Item closed → « Terminé »",
  "Pull request linked to issue → « En cours »",
  "Pull request merged → « Terminé »",
  "Auto-close issue (issue fermée quand passée en « Terminé »)",
  "Auto-add sub-issues to project",
];

function statusField(number) {
  const field = ghJson(["project", "field-list", number, "--owner", owner]).fields.find(
    (f) => f.name === "Status",
  );
  if (!field) throw new Error("pas de champ Status sur ce board");
  return field;
}

function init() {
  const repo = args.repo;
  if (!repo?.includes("/")) throw new Error("usage : board.mjs init --repo <owner/name> [--title t]");
  const title = args.title ?? repo.split("/")[1];

  const existing = ghJson(["project", "list", "--owner", owner, "--limit", "100"]).projects.find(
    (p) => p.title === title,
  );
  const board = existing ?? ghJson(["project", "create", "--owner", owner, "--title", title]);

  const field = statusField(String(board.number));
  const wantedNames = STATUSES.map((s) => s.name);
  const currentNames = field.options.map((o) => o.name);
  const reconfigured = JSON.stringify(currentNames) !== JSON.stringify(wantedNames);
  if (reconfigured) {
    // Replacing the options resets the status of existing items: only do it on a board that
    // doesn't use the kit's columns yet (a fresh board has none).
    const query = `mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
      updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
        projectV2Field { ... on ProjectV2SingleSelectField { id } }
      }
    }`;
    const options = STATUSES.map(({ name, color, description }) => ({ name, color, description }));
    gh(["api", "graphql", "--input", "-"], JSON.stringify({ query, variables: { fieldId: field.id, options } }));
  }

  try {
    gh(["project", "link", String(board.number), "--owner", owner, "--repo", repo]);
  } catch (error) {
    if (!/already/i.test(error.message)) throw error;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        created: !existing,
        reconfigured,
        number: board.number,
        url: board.url,
        statuses: wantedNames,
        workflowsToEnable: WORKFLOWS_TO_ENABLE,
      },
      null,
      2,
    ),
  );
}

function addOrSetStatus() {
  if (!url) throw new Error("usage : board.mjs add <url> [--status s] | board.mjs status <url> <s>");
  if (!owner || !project) {
    throw new Error("owner/board inconnus : passer --owner et --project, ou les vars du lock");
  }
  const wanted = command === "status" ? statusArg : args.status;
  if (command === "status" && !wanted) throw new Error("statut manquant");

  const itemId = ghJson(["project", "item-add", project, "--owner", owner, "--url", url]).id;
  let applied = null;
  if (wanted) {
    const name = aliases[wanted] ?? wanted;
    const projectId = ghJson(["project", "view", project, "--owner", owner]).id;
    const field = statusField(project);
    const option = field.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!option) {
      const names = field.options.map((o) => o.name).join(", ");
      throw new Error(`statut « ${name} » introuvable (disponibles : ${names})`);
    }
    gh([
      "project",
      "item-edit",
      "--id",
      itemId,
      "--project-id",
      projectId,
      "--field-id",
      field.id,
      "--single-select-option-id",
      option.id,
    ]);
    applied = option.name;
  }
  console.log(JSON.stringify({ ok: true, owner, project, url, itemId, status: applied }));
}

try {
  if (command === "init") init();
  else if (command === "add" || command === "status") addOrSetStatus();
  else throw new Error("commandes : init | add | status");
} catch (error) {
  console.error(`board: ${error.message}`);
  process.exit(1);
}
