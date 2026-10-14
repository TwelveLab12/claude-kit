#!/usr/bin/env node
// Échec du canary planifié : une relance, pour écarter une panne passagère (miroir apt, registre
// npm). Si la relance échoue aussi, commente l'issue « Canary en échec » ouverte, ou l'ouvre.
//
//   node scripts/canary-retry.mjs --repo <owner/nom> --run-id <id> --attempt <n> --url <url du run>
//
// Lancé par le workflow `Canary (relance)` : un run ne peut pas se relancer tant qu'il tourne.
// Le script attend lui-même la fin de la relance : une relance faite avec le GITHUB_TOKEN ne
// redéclenche pas forcément `workflow_run`. Un run déjà relancé (attempt > 1) est donc ignoré.
// `--poll-seconds` règle l'intervalle d'attente (30 par défaut).

import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ISSUE_TITLE = "Canary en échec";

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(String(error.stderr ?? "").trim() || error.message);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

// Attend la fin de la tentative suivante du run.
async function waitForAttempt(repo, runId, attempt, pollSeconds) {
  for (;;) {
    const run = JSON.parse(gh(["api", `repos/${repo}/actions/runs/${runId}`]));
    if (run.run_attempt > attempt && run.status === "completed") return run;
    await sleep(pollSeconds * 1000);
  }
}

function report(repo, url) {
  const search = ["--state", "open", "--search", `"${ISSUE_TITLE}" in:title`];
  const list = gh(["issue", "list", "--repo", repo, ...search, "--json", "number,title"]);
  const open = JSON.parse(list);
  // La recherche GitHub est approximative : on garde les titres qui commencent vraiment ainsi.
  const issue = open.find((i) => i.title.startsWith(ISSUE_TITLE));
  if (issue) {
    const body = `Nouvel échec, relance comprise : ${url}`;
    gh(["issue", "comment", String(issue.number), "--repo", repo, "--body", body]);
    return { action: "comment", issue: issue.number };
  }
  const body = [
    `Le canary planifié (projet neuf avec tous les modules) échoue, relance comprise : ${url}.`,
    "",
    "Probablement une évolution de l'écosystème : lancer `/claude-kit:audit`. Les échecs suivants",
    "sont ajoutés en commentaire tant que cette issue est ouverte.",
  ].join("\n");
  const fields = ["--label", "chore", "--title", ISSUE_TITLE, "--body", body];
  gh(["issue", "create", "--repo", repo, ...fields]);
  return { action: "create" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const missing = ["repo", "run-id", "attempt", "url"].filter((k) => !args[k]);
  if (missing.length) {
    throw new Error(`arguments manquants : ${missing.map((k) => `--${k}`).join(", ")}`);
  }
  const attempt = Number(args.attempt);
  if (attempt > 1) return { action: "none", reason: "run déjà relancé" };

  gh(["run", "rerun", args["run-id"], "--repo", args.repo]);
  const pollSeconds = Number(args["poll-seconds"] ?? 30);
  const run = await waitForAttempt(args.repo, args["run-id"], attempt, pollSeconds);
  if (run.conclusion === "success") return { action: "rerun", conclusion: run.conclusion };
  return { action: "rerun", conclusion: run.conclusion, ...report(args.repo, args.url) };
}

main().then(
  (result) => console.log(JSON.stringify(result)),
  (error) => {
    console.error(`canary-retry : ${error.message}`);
    process.exit(1);
  },
);
