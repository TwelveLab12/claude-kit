---
name: scaffold
description: Crée un nouveau projet Next.js/TypeScript (ou équipe un projet existant) avec l'outillage TwelveLab12 choisi de façon interactive — ESLint, Prettier, Husky, Vitest, Playwright, Tailwind/shadcn, CI GitHub, Dependabot, workflow issues/board, règles Claude. À utiliser quand l'utilisateur veut démarrer un projet, "scaffolder", ou mettre un projet existant aux standards du kit.
argument-hint: "[dossier-cible] [description du projet]"
---

# /claude-kit:scaffold

Tu poses les questions et tu écris ce qui est propre au projet ; **tout le mécanique passe par
`scripts/apply.mjs`** (reproductible, testé par le canary du kit). Ne recopie jamais à la main un
fichier qu'un module fournit.

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`). Toutes les
commandes ci-dessous utilisent `node "$KIT/scripts/apply.mjs" …`.

## 1. Situer la cible

- Argument 1 = dossier cible (défaut : demander). Argument 2 = description du projet (optionnel).
- Dossier inexistant ou vide → **mode création**. Dossier avec `package.json` → **mode adoption**
  (projet existant). Si `.claude/kit.lock.json` existe déjà, c'est un sync : bascule sur
  `/claude-kit:sync`.
- Lancer `node "$KIT/scripts/apply.mjs" list` pour le catalogue à jour (ids, titres, défauts,
  dépendances entre modules). Ne te fie pas à une liste mémorisée : le catalogue évolue.
- En adoption, détecter l'existant pour **pré-cocher** les modules : `package.json` (eslint,
  prettier, husky, vitest, @playwright/test, tailwindcss, radix-ui…), `.github/workflows/`,
  `.github/dependabot.yml`, `docs/adr/`, labels et board (`gh label list`, `gh project list`).

## 2. Questions (AskUserQuestion)

Deux appels maximum, `multiSelect: true` pour les choix de modules. Libellés en français, défauts
du catalogue marqués « (Recommended) » en premier, `description` = une phrase tirée du catalogue.

**Appel 1 : modules**
1. Qualité : `eslint`, `prettier`, `husky`, `a11y` (accessibilité WCAG 2.2 AA / RGAA)
2. Tests : `vitest`, `playwright`
3. UI & Next : `tailwind-shadcn`, React Compiler (création uniquement, flag `--react-compiler`)
4. GitHub : `github-ci`, `dependabot`, `github-workflow`, `vercel-check`

**Appel 2 : options** (ne poser que ce qui s'applique)
1. Lanceur : `pnpm` (Recommended) ou `volta` (commandes `volta run pnpm …`, alias shell `vrp`)
2. Board (si `github-workflow`) : proposer les boards existants (`gh project list --owner <owner>`),
   « Nouveau board pour ce projet » ou « Pas de board pour l'instant »
3. Extras : `docs-adr`, `claude-settings` (cochés par défaut)
4. Dépôt GitHub (création uniquement) : « Créer le repo maintenant (privé) », « … (public) »,
   « Plus tard »

`core` est toujours inclus ; les dépendances (`requires`) sont ajoutées automatiquement par le
script, inutile de les demander.

## 3. Construire la commande

- Variables (`--var clé=valeur`) : `owner` (compte GitHub : `gh api user --jq .login`),
  `boardNumber`, `run` (`pnpm` ou `volta`), et pour un **nouveau** board les statuts par défaut de
  GitHub : `statusTodo=Todo statusDoing="In Progress" statusDone=Done`. Les boards existants de
  TwelveLab12 utilisent « À faire / En cours / Terminé » (défaut du kit) : vérifier avec
  `gh project field-list <n> --owner <owner> --format json`.
- Création : `node "$KIT/scripts/apply.mjs" create <dossier> --modules a,b,c --var … [--react-compiler]`.
- Adoption : **toujours d'abord** `apply <dossier> --modules … --var … --dry-run`, puis :
  - présenter `written` (fichiers gérés créés ou remplacés), `conflicts` (scripts/champs
    `package.json` qui diffèrent : l'existant est conservé), `seedDiffers` (fichiers du projet qui
    diffèrent du modèle : comparer avec le fichier `proposal` indiqué et proposer les morceaux
    utiles, sans écraser) ;
  - si le projet suit un workflow issue/branche (CLAUDE.md, board), créer d'abord l'issue et la
    branche avec `/claude-kit:start-task`, jamais de changement directement sur `main` ;
  - puis relancer sans `--dry-run`.
- Le rapport JSON final est après la ligne `--- claude-kit report ---`. Si `checks` contient un
  `ok: false` (ex. shadcn installé sur Base UI), corriger avant d'aller plus loin. Si `unresolved`
  n'est pas vide, une variable manque : la demander et relancer. Si un `patches[].results` a
  `applied: false`, un défaut amont a changé (ex. tokens shadcn) : le signaler et laisser le test
  concerné (contraste des tokens) trancher.

## 4. Écrire ce qui est propre au projet

Dans `CLAUDE.md`, **au-dessus** du bloc `<!-- BEGIN:claude-kit -->` (le bloc est régénéré, ne
jamais écrire dedans) :
- `## Projet` : but, public, déploiement, contraintes (depuis la description ; en adoption,
  reprendre l'existant) ;
- `## Architecture` : organisation de `src/`, sources de vérité, patterns. En création, rester
  court (le projet est vide) ; en adoption, retirer du CLAUDE.md existant tout ce que les modules
  couvrent désormais (commandes, conventions qualité, workflow) pour éviter les doublons.
- Ajouter dans `docs/dependencies.md` une ligne pour chaque dépendance marquée « _à documenter_ ».
- En création : `lang` de `<html>` (`app/layout.tsx`) = langue du contenu (`fr` par défaut pour
  TwelveLab12, `create-next-app` met `en`) et `metadata.title` réel (gabarit `%s | <Nom>`) au lieu de
  « Create Next App » : RGAA 8.3, 8.4 et 8.6.

## 5. Vérifier

Lancer la baseline indiquée dans `.claude/kit/core.md` (typecheck, lint:ci, test, build) plus
`format:check`, et `test:e2e` si Playwright est sélectionné. Tout doit être vert avant le commit. Ne
pas maquiller un échec : le signaler avec la sortie.

## 6. Git et GitHub

- Création : commit initial sur `main` (`chore: scaffold via claude-kit <version>`), le hook
  pre-commit s'exécute normalement.
- Actions visibles à l'extérieur → **confirmer explicitement avant chacune** : `gh repo create
  <owner>/<nom> --private|--public --source . --push`, labels
  (`gh label create <name> --color <c> --description <d> --force` pour chaque entrée de
  `$KIT/modules/github-workflow/labels.json`), board (`gh project create --owner <owner> --title
  <nom>` si nouveau, puis `gh project link <n> --owner <owner> --repo <owner>/<nom>`).
- Les commandes `gh project` exigent le scope `project` : en cas d'erreur de scope, demander à
  l'utilisateur de lancer lui-même `gh auth refresh -s project`.
- Recommander (sans pouvoir le faire à sa place, c'est dans l'UI GitHub) d'activer les workflows
  intégrés du board : *Auto-add to project* (filtre `repo:<owner>/<nom>`), *Item closed* et
  *Pull request merged* → statut terminé. Le board reste alors à jour sans effort.
- Vercel (`vercel-check`) : rappeler de sélectionner le check `vercelCheckName` dans Settings ›
  Deployment Checks du projet Vercel.

## 7. Compte rendu

En quelques lignes : modules installés, ce qui a été vérifié (et le résultat), actions GitHub
faites ou restantes, fichiers `seedDiffers`/`conflicts` laissés à l'arbitrage de l'utilisateur.
