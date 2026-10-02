# claude-kit

Scaffold **interactif** Next.js/TypeScript + conventions Claude Code + workflow GitHub (issues,
labels, board, PR) de TwelveLab12, sous forme de plugin Claude Code. Remplace
`ts-project-template` : au lieu de cloner des versions figées, le kit génère un projet neuf avec
`create-next-app@latest` puis y applique les modules choisis, et un canary hebdomadaire vérifie que
l'ensemble tient toujours sur les dernières versions.

## Installation (une fois par machine)

Dans Claude Code :

```text
/plugin marketplace add TwelveLab12/claude-kit
/plugin install claude-kit@twelvelab
```

En local, pour développer le kit : `/plugin marketplace add C:\Users\bruno\code\claude-kit`.
Les projets équipés du module `claude-settings` déclarent aussi la marketplace et le plugin dans
leur `.claude/settings.json` : un clone frais propose l'installation automatiquement.

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
| `core` (toujours) | tsconfig strict, `.nvmrc` (Node LTS), `.gitattributes` LF, `typecheck` avec `next typegen` |
| `tailwind-shadcn` | Tailwind v4 + shadcn/ui sur **Radix** (pas Base UI) |
| `eslint` | flat config Next + convention `_` |
| `prettier` | printWidth 100, plugin Tailwind, `format:check` en CI |
| `husky` | pre-commit lint-staged (jamais les tests) |
| `vitest` | Vitest + Testing Library, jsdom, couverture v8 |
| `playwright` | e2e sur build de prod + smoke test axe |
| `a11y` | WCAG 2.2 AA / RGAA : jsx-a11y strict, axe en Vitest, contraste des tokens, suite e2e par route (axe, reflow 320 px, focus visible, structure), règles Claude |
| `docs-adr` | `docs/adr/` + `docs/dependencies.md` généré |
| `github-ci` | CI générée selon les modules |
| `vercel-check` | Deployment Check Vercel |
| `dependabot` | npm (minor/patch groupés) + actions |
| `github-workflow` | règles issue/label/board/PR, templates d'issue et de PR |
| `claude-settings` | `.claude/settings.json` partagé (permissions, garde-fous, plugin) |

## Comment ça marche

- **Claude pose les questions, le script fait le mécanique.** `scripts/apply.mjs` est
  déterministe et testable sans Claude ; les skills s'occupent du dialogue, de ce qui est propre au
  projet (sections Projet/Architecture du `CLAUDE.md`) et des actions GitHub.
- Chaque module (`modules/<id>/`) fournit :
  - `managed/` : fichiers possédés par le kit, réécrits à chaque sync ;
  - `seed/` : fichiers possédés par le projet une fois créés (configs, tests d'exemple). Un sync
    ne les écrase jamais, il propose un diff ;
  - `merge/` : JSON fusionné dans l'existant ;
  - `rules.md` : règles Claude, copiées dans `.claude/kit/<id>.md` et importées par `CLAUDE.md`
    dans un bloc `<!-- BEGIN:claude-kit -->` régénéré ;
  - `module.json` : dépendances, scripts, ignores, commandes post-install, variables, `patches`
    littéraux (ex. tokens shadcn corrigés pour l'accessibilité) ;
  - `seed@a+b/` ou `managed@a/` : variantes copiées seulement si les modules listés sont
    sélectionnés.
- Les fichiers composés (CI, `.prettierrc.json`, lint-staged, bloc `.gitignore`,
  `docs/dependencies.md`) sont générés selon la combinaison de modules.
- Toute sortie passe par le Prettier du projet : un sync sans changement du kit n'écrit rien.
- `.claude/kit.lock.json` mémorise version du kit, modules et variables, et sert de base au sync.
- **Versions** : ce qui vient avec Next (next, react, eslint, typescript, tailwind) est laissé à
  `create-next-app@latest`, qui choisit des versions compatibles entre elles. Le reste est installé
  en `@latest`. Rien n'est figé dans le kit.

## Faire évoluer les standards

1. Le **canary** (`.github/workflows/canary.yml`) génère chaque lundi un projet avec tous les
   modules et lance typecheck, format, lint, tests, build, e2e et un sync d'idempotence. S'il casse,
   il ouvre une issue.
2. `/claude-kit:audit` dans ce repo compare les modules à l'écosystème (versions, notes de version,
   recommandations officielles) et propose des issues sourcées.
3. Une évolution = une PR sur ce repo, avec bump de `version` dans `.claude-plugin/plugin.json` et
   une entrée dans `CHANGELOG.md`. Les projets la récupèrent via `/claude-kit:sync`.

## Réglages GitHub à faire à la main

- Scope `project` pour `gh` : `gh auth refresh -s project`.
- Sur le board, activer les workflows intégrés *Auto-add to project*, *Item closed* et
  *Pull request merged* (statut terminé).
