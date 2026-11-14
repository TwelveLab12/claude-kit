# claude-kit

Scaffold **interactif** Next.js/TypeScript + conventions Claude Code + workflow GitHub (issues,
labels, board, PR) de TwelveLab12, sous forme de plugin Claude Code. Remplace
`ts-project-template` : au lieu de cloner des versions figées, le kit génère un projet neuf avec
`create-next-app@latest` puis y applique les modules choisis, et un canary hebdomadaire vérifie que
l'ensemble tient toujours sur les dernières versions.

> **Statut : alpha.** claude-kit est mon outil de travail personnel, pensé pour ma stack (Next.js,
> TypeScript, pnpm, Vercel, GitHub Projects) et mes conventions. Tant qu'il est en 0.x, une version
> mineure peut demander une action manuelle : le [CHANGELOG](CHANGELOG.md) la décrit à chaque fois.
> Je ne le conseille pas pour un besoin général. Ce qui se transpose, ce sont ses principes :
> TypeScript strict, analyse statique (ESLint, Prettier), une CI qui bloque, le workflow issue →
> branche → PR et les ADR.

## Installation (une fois par machine)

Dans un terminal :

```bash
claude plugin marketplace add TwelveLab12/claude-kit
claude plugin install claude-kit@twelvelab
```

Sous Windows avec WSL, ces commandes se lancent dans un terminal WSL. L'app de bureau ne gère pas
encore les plugins dans ses sessions WSL, mais ces sessions chargent le plugin installé dans la
distribution. Le kit ne s'ajoute pas comme plugin du compte claude.ai (« Personnalisation » de
l'app) : il serait chargé en double.

En local, pour développer le kit : `claude plugin marketplace add <chemin absolu du clone>` (sous
WSL, par exemple `/home/<utilisateur>/Projects/claude-kit`).
Les projets équipés du module `claude-settings` déclarent aussi la marketplace et le plugin dans
leur `.claude/settings.json` : un clone frais propose l'installation automatiquement.

## Mettre à jour le plugin

Une nouvelle version (tag `v<version>`, voir le [CHANGELOG](CHANGELOG.md)) n'est pas installée
automatiquement : la mise à jour automatique est désactivée par défaut pour une marketplace tierce.

```bash
claude plugin marketplace update twelvelab
claude plugin update claude-kit@twelvelab
```

- La première commande rafraîchit le catalogue de la marketplace, pour toute la machine.
- La seconde met à jour l'installation utilisateur, qui sert à tous les projets.
- Un projet qui a sa propre installation (portée `project` dans `claude plugin list`) se met à jour
  depuis son dossier, avec `claude plugin update claude-kit@twelvelab --scope project`. Avant
  Claude Code 2.1.281, la commande sans `--scope` ne met à jour que l'installation utilisateur.
- `claude plugin list`, lancé depuis le projet, doit afficher la dernière version pour chaque
  entrée `claude-kit@twelvelab`. Une session déjà ouverte garde l'ancienne version jusqu'à ce
  qu'on en ouvre une nouvelle.
- Le plugin se met à jour avant tout `/claude-kit:sync`. Un plugin antérieur à 0.6.0 ne refuse pas
  un kit plus ancien que le projet, et il écrase ce que le projet a modifié.
- La mise à jour automatique s'active dans une session `claude` lancée en terminal : `/plugin`,
  onglet Marketplaces, `twelvelab`, *Enable auto-update*. Un sync reste toujours une action
  explicite.

## Utilisation

| Commande | Rôle |
| --- | --- |
| `/claude-kit:scaffold [dossier] [description]` | Nouveau projet, ou équiper un projet existant (dry-run d'abord). Questions interactives sur les modules et options. |
| `/claude-kit:sync [+module] [-module]` | Mettre un projet à jour vers la version courante du kit, ajouter ou retirer un module. |
| `/claude-kit:start-task <tâche>` | Issue + label de type + board « En cours » + branche `<type>/<n>-<slug>`. |
| `/claude-kit:ship-task [--merge]` | Baseline, rebase, PR `Closes #n`, puis squash-merge, nettoyage, board « Terminé ». |
| `/claude-kit:audit` | Dans un projet : dérive par rapport au kit. Dans ce repo : écart des modules avec l'écosystème. |
| `/claude-kit:a11y-audit <route> [--declaration]` | Audit d'accessibilité d'une page par thématique RGAA (WCAG 2.2 AA), déclaration d'accessibilité en option. |

Agent fourni : `a11y-reviewer`, qui relit un diff d'UI contre la grille RGAA. `/claude-kit:ship-task`
l'appelle avant d'ouvrir une PR.

Un hook `SessionStart` signale quand un projet a été généré avec une version plus ancienne du kit.

## Modules

`node scripts/apply.mjs list` donne le catalogue à jour. En résumé :

| Module | Contenu |
| --- | --- |
| `core` (toujours) | tsconfig strict, version de Node (épinglage Volta dans `package.json` avec `run=volta`, sinon `.nvmrc`), lue aussi par la CI, `.gitattributes` LF, `typecheck` avec `next typegen` |
| `tailwind-shadcn` | Tailwind v4 + shadcn/ui. Nouveau projet : **Base UI** par défaut (défaut de shadcn) ou Radix (`uiBase`) ; projet existant : la bibliothèque installée est détectée et conservée |
| `eslint` | flat config Next + convention `_` |
| `prettier` | printWidth 100, plugin Tailwind, `format:check` en CI |
| `husky` | pre-commit lint-staged (jamais les tests) |
| `vitest` | Vitest + Testing Library, jsdom, couverture v8 |
| `playwright` | e2e sur build de prod + smoke test axe |
| `a11y` | WCAG 2.2 AA / RGAA : jsx-a11y strict, axe en Vitest, contraste des tokens, suite e2e par route + 404 (axe, reflow 320 px, indicateur de focus mesuré à 3:1, structure), `docs/accessibility.md` (couverture RGAA, tests manuels), ADR de stratégie, règles Claude ; `a11yGate=advisory` pour un projet avec dette |
| `docs-adr` | `docs/adr/` + `docs/dependencies.md` généré |
| `github-ci` | CI générée selon les modules |
| `vercel-check` | Deployment Check Vercel |
| `dependabot` | npm (minor/patch groupés) + actions |
| `github-workflow` | règles issue/label/PR, un board par dépôt (Backlog / À faire / En cours / Terminé), templates d'issue et de PR |
| `claude-settings` | `.claude/settings.json` partagé (permissions, garde-fous, plugin) |

## Comment ça marche

- **Claude pose les questions, le script fait le mécanique.** `scripts/apply.mjs` est
  déterministe et testable sans Claude ; les skills s'occupent du dialogue, de ce qui est propre au
  projet (sections Projet/Architecture du `CLAUDE.md`) et des actions GitHub.
- Chaque module (`modules/<id>/`) fournit :
  - `managed/` : fichiers possédés par le kit. Un sync les met à jour tant que le projet n'y
    touche pas ; une modification du projet est signalée comme un écart, jamais écrasée ;
  - `seed/` : fichiers possédés par le projet une fois créés (configs, tests d'exemple). Un seed
    intact suit le kit ; modifié, il n'est jamais écrasé, et un changement du kit est proposé ;
  - `merge/` : JSON fusionné dans l'existant ;
  - `rules.md` : règles Claude, copiées dans `.claude/kit/<id>.md` et importées par `CLAUDE.md`
    dans un bloc `<!-- BEGIN:claude-kit -->` régénéré ;
  - `module.json` : dépendances, scripts, ignores, commandes post-install, variables, `patches`
    littéraux (ex. tokens shadcn corrigés pour l'accessibilité) ;
  - `seed@a+b/` ou `managed@a/` : variantes copiées seulement si les modules listés sont
    sélectionnés ;
  - `block/` ou `block@a+b/` : corps d'un bloc tenu par le kit dans un fichier `.css` du projet
    (ex. l'anneau de focus de `a11y` dans `globals.css`, [ADR 0009](docs/adr/0009-css-block-in-project-stylesheet.md)) ;
  - `fresh/` : seed écrit uniquement à la création d'un projet (ex. un ADR numéroté, qui
    entrerait en collision avec ceux d'un projet existant).
- Les fichiers composés (CI, `.prettierrc.json`, lint-staged, bloc `.gitignore`,
  `docs/dependencies.md`) sont générés selon la combinaison de modules.
- Toute sortie passe par le Prettier du projet : un sync sans changement du kit n'écrit rien.
- `.claude/kit.lock.json` mémorise version du kit, modules et variables. Un kit plus ancien que
  celui du lock refuse de synchroniser.
- **Sync à trois voies** ([ADR 0008](docs/adr/0008-sync-three-way-base.md)) :
  `.claude/kit/base.json` garde ce que le kit a écrit au dernier passage. Chaque fichier, bloc et
  clé de `package.json` est comparé dans trois versions (base, projet, kit) : le sync écrit ce que
  le projet n'a pas touché, et classe le reste dans le rapport (`drifts`, `proposals`,
  `conflicts`, `missing`) au lieu de l'écraser. Un reformatage n'est pas une modification, ni la
  version d'une action GitHub montée par Dependabot.
- **Versions** : ce qui vient avec Next (next, react, eslint, typescript, tailwind) est laissé à
  `create-next-app@latest`, qui choisit des versions compatibles entre elles. Le reste est installé
  en `@latest`. Rien n'est figé dans le kit.
- Les décisions structurantes du kit et leurs raisons sont dans [docs/adr/](docs/adr/).

## Faire évoluer les standards

1. Le **canary** (`.github/workflows/canary.yml`) génère chaque lundi un projet avec tous les
   modules et lance la baseline avant la PR (typecheck, format, lint, tests, puis build et e2e en
   mode CI avec `test:e2e:ci`) et un sync d'idempotence. Un second job génère un projet avec la
   version précédente du kit, le synchronise, puis lance la même baseline et un second sync qui ne
   doit rien écrire (montée de version). Un échec planifié est relancé une fois
   (`canary-retry.yml`) ; si la relance échoue aussi, l'issue « Canary en échec » ouverte reçoit un
   commentaire, ou est ouverte.
2. `/claude-kit:audit` dans ce repo compare les modules à l'écosystème (versions, notes de version,
   recommandations officielles) et propose des issues sourcées.
3. Une évolution = une PR sur ce repo, avec bump de `version` dans `.claude-plugin/plugin.json` et
   une entrée dans `CHANGELOG.md`, vérifiés par `scripts/check-release.mjs` ; le merge pose le tag
   `v<version>` ([ADR 0005](docs/adr/0005-one-version-one-code.md)). Les projets la récupèrent via
   `/claude-kit:sync`.

## Réglages GitHub à faire à la main

- Scope `project` pour `gh` : `gh auth refresh -s project`.
- Un board par dépôt, créé et configuré par `node scripts/board.mjs init --repo <owner>/<nom>`
  (colonnes Backlog / À faire / En cours / Terminé). Les workflows intégrés n'ont pas d'API : les
  activer dans *Workflows* du board (la commande en donne la liste : item ajouté → « À faire », PR
  liée → « En cours », PR mergée et item fermé → « Terminé », auto-close, sous-issues).
- Sous Linux/WSL, bibliothèques système de Chromium pour Playwright, une fois par machine :
  `sudo apt-get install -y $(pnpm exec playwright install-deps --dry-run chromium 2>/dev/null | sed -n 's/^  //p')`
  (avec Volta : `volta run pnpm exec …`). Seul `apt` passe en root : un shim Volta ne fonctionne
  pas sous `sudo`.
- Dans ce repo : `main` est protégée, avec les checks `test` et `release-check` obligatoires
  (ADR 0005), administrateurs compris ; ni push forcé ni suppression.

## Licence

[MIT](LICENSE).
