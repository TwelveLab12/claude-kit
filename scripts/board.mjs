#!/usr/bin/env node
// claude-kit — GitHub Project (board) helper, so nobody has to juggle GraphQL node ids.
//
//   node board.mjs add    <issue-or-pr-url> [--status <name>]
//   node board.mjs status <issue-or-pr-url> <status name>
//
// Owner, project number and status names default to the project's .claude/kit.lock.json vars
// (owner, boardNumber, statusTodo/statusDoing/statusDone); override with --owner / --project.
// Status may also be given as todo | doing | done.
// Needs a gh token with the `project` scope: `gh auth refresh -s project`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (stderr.includes("required scopes")) {
      throw new Error("le token gh n'a pas le scope `project` : lancer `gh auth refresh -s project`");
    }
    throw new Error(stderr.trim() || error.message);
  }
}

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
const owner = args.owner ?? lockVars.owner;
const project = args.project ?? lockVars.boardNumber;
const aliases = {
  todo: lockVars.statusTodo ?? "À faire",
  doing: lockVars.statusDoing ?? "En cours",
  done: lockVars.statusDone ?? "Terminé",
};

try {
  if (!["add", "status"].includes(command) || !url) {
    throw new Error("usage : board.mjs add <url> [--status s] | board.mjs status <url> <s>");
  }
  if (!owner || !project) {
    throw new Error("owner/board inconnus : passer --owner et --project, ou les vars du lock");
  }
  const wanted = command === "status" ? statusArg : args.status;
  if (command === "status" && !wanted) throw new Error("statut manquant");

  const itemId = JSON.parse(
    gh(["project", "item-add", project, "--owner", owner, "--url", url, "--format", "json"]),
  ).id;
  let applied = null;
  if (wanted) {
    const name = aliases[wanted] ?? wanted;
    const projectId = JSON.parse(
      gh(["project", "view", project, "--owner", owner, "--format", "json"]),
    ).id;
    const fields = JSON.parse(
      gh(["project", "field-list", project, "--owner", owner, "--format", "json"]),
    ).fields;
    const statusField = fields.find((f) => f.name === "Status");
    if (!statusField) throw new Error("pas de champ Status sur ce board");
    const option = statusField.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!option) {
      const names = statusField.options.map((o) => o.name).join(", ");
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
      statusField.id,
      "--single-select-option-id",
      option.id,
    ]);
    applied = option.name;
  }
  console.log(JSON.stringify({ ok: true, owner, project, url, itemId, status: applied }));
} catch (error) {
  console.error(`board: ${error.message}`);
  process.exit(1);
}
