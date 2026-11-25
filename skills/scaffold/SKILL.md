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
  prettier, husky, vitest, @playwright/test, tailwindcss, radix-ui ou @base-ui/react…), `.github/workflows/`,
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
1. Board (si `github-workflow`) : « Nouveau board dédié à ce dépôt (Recommended) » (convention :
   un board par dépôt), « Board existant » (en adoption, s'il suit déjà ce repo :
   `gh project list --owner <owner>`), ou « Pas de board pour l'instant »
2. **Création avec `tailwind-shadcn`** : bibliothèque de primitives sous les composants shadcn,
   « Base UI (Recommended) » (défaut actuel de shadcn, `--var uiBase=base`) ou « Radix »
   (`--var uiBase=radix`, ex. pour partager des composants avec un projet existant sur Radix). Les
   extras `docs-adr` et `claude-settings` sont alors inclus d'office (le dire dans le récapitulatif,
   retirables ensuite par `/claude-kit:sync -<module>`).
   **Sinon** (adoption, ou pas de shadcn) : extras `docs-adr`, `claude-settings` (cochés par
   défaut). En adoption, la bibliothèque n'est **jamais** demandée : le script détecte celle qui
   est installée et la conserve ; ne pas proposer de migration.
3. Dépôt GitHub (création uniquement) : « Créer le repo maintenant (privé) », « … (public) »,
   « Plus tard »

`core` est toujours inclus ; les dépendances (`requires`) sont ajoutées automatiquement par le
script, inutile de les demander.

## 3. Construire la commande

- Variables (`--var clé=valeur`) : `owner` (compte GitHub : `gh api user --jq .login`),
  `boardNumber`. Ne pas passer `run` : `run=volta` est déprécié (Volta n'est plus maintenu), le kit
  ne le gère plus que pour les locks existants. Les statuts par défaut du kit sont « Backlog /
  À faire / En cours / Terminé », ceux que crée `board.mjs init`. Pour un board existant aux colonnes
  différentes, passer `statusBacklog`/`statusTodo`/`statusDoing`/`statusDone` d'après
  `gh project field-list <n> --owner <owner> --format json`.
- Un nouveau board n'a pas encore de numéro : le créer à l'étape 6, puis relancer
  `apply . --from-lock --var boardNumber=<n> --no-install` pour l'inscrire dans les règles.
- Création : `node "$KIT/scripts/apply.mjs" create <dossier> --modules a,b,c --var … [--react-compiler]`.
- Adoption : **toujours d'abord** `apply <dossier> --modules … --var … --dry-run`, puis :
  - présenter le rapport (`bootstrap: "A2"`). Un fichier absent est créé, un fichier existant
    n'est jamais écrasé :
    - `written` : fichiers créés, clés de `package.json` ajoutées ;
    - `drifts` : fichiers gérés par le kit que le projet a déjà, dans une autre version. Comparer
      au fichier `proposal` et décider avec l'utilisateur : reprendre la version du kit, sinon
      l'écart reste signalé à chaque sync ;
    - `proposals` : fichiers du projet qui diffèrent du modèle. Comparer avec `proposal` et
      proposer les morceaux utiles, sans écraser ;
    - `conflicts` : scripts et champs de `package.json` qui diffèrent. L'existant est conservé ;
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
- Avec `a11y`, en création : lien d'évitement « Aller au contenu principal » comme premier enfant
  du `<body>` du layout (visible au focus : `sr-only focus:not-sr-only …`), vers `#contenu`, et
  `id="contenu"` sur le `<main>` de `app/page.tsx`. La 404 fournie par le kit (`not-found.tsx`) a
  déjà cet `id`. Revérifier ensuite `test:e2e`.

## 5. Vérifier

Lancer la baseline avant la PR indiquée dans `.claude/kit/core.md` : les étapes de la CI, e2e
compris si Playwright est sélectionné. Tout doit être vert avant le commit. Ne pas maquiller un
échec : le signaler avec la sortie.

## 6. Git et GitHub

- Création : commit initial sur `main` (`chore: scaffold via claude-kit <version>`), le hook
  pre-commit s'exécute normalement.
- Actions visibles à l'extérieur → **confirmer explicitement avant chacune** : `gh repo create
  <owner>/<nom> --private|--public --source . --push`, labels
  (`gh label create <name> --color <c> --description <d> --force` pour chaque entrée de
  `$KIT/modules/github-workflow/labels.json` ; une entrée avec `"if": "<module>"` seulement si ce
  module est sélectionné), board : `node "$KIT/scripts/board.mjs" init --repo <owner>/<nom>`
  (crée ou réutilise le board du même titre, configure les 4 colonnes, le lie au dépôt).
- Les commandes `gh project` exigent le scope `project` : en cas d'erreur de scope, demander à
  l'utilisateur de lancer lui-même `gh auth refresh -s project`.
- Les workflows intégrés du board n'ont pas d'API : donner à l'utilisateur le lien du board et la
  liste `workflowsToEnable` renvoyée par `board.mjs init`, à activer dans *Workflows*. Le board se
  tient alors à jour seul (PR liée, PR mergée, issue fermée).
- Vercel (`vercel-check`) : rappeler de sélectionner le check `vercelCheckName` dans Settings ›
  Deployment Checks du projet Vercel.

## 7. Compte rendu

En quelques lignes : modules installés, ce qui a été vérifié (et le résultat), actions GitHub
faites ou restantes, entrées `drifts`/`proposals`/`conflicts` laissées à l'arbitrage de l'utilisateur.
