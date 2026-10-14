# 0002 — Propriété des fichiers : managed, seed, merge

**Statut** : Acceptée (décision de la 0.1.0, 28/09/2026 ; consignée le 13/10/2026). Modifiée par
l'ADR 0008 : un fichier managed modifié par le projet n'est plus réécrit.

## Contexte

Le kit écrit des fichiers dans des projets qui évoluent ensuite seuls. Certains doivent rester
identiques d'un projet à l'autre pour que le kit puisse les faire évoluer : CI, règles Claude,
`dependabot.yml`. D'autres ne sont qu'un point de départ que le projet adapte : `tsconfig.json`,
configs ESLint, Vitest et Playwright, tests d'exemple. D'autres enfin sont partagés :
`package.json`, `.claude/settings.json`. Un sync doit livrer les évolutions du kit sans écraser ce
que le projet a personnalisé.

## Décision

Le dossier où un fichier est rangé dans son module fixe son propriétaire :

- `managed/` : possédé par le kit, réécrit à chaque sync. Le projet ne le modifie pas.
- `seed/` : possédé par le projet une fois créé. Un sync ne l'écrase jamais : il propose un diff
  (`seedDiffers`).
- `merge/` : JSON fusionné dans l'existant.
- `fresh/` : écrit seulement à la création d'un projet.
- `seed@a+b/`, `managed@a/` : variantes copiées seulement si les modules listés sont sélectionnés.

Le script génère les fichiers composés (CI, `.prettierrc.json`, lint-staged, bloc `.gitignore`,
`docs/dependencies.md`) selon la combinaison de modules. En cas de doute, un fichier va dans
`seed/`. `.claude/kit.lock.json` garde la version du kit, les modules et les variables.

## Conséquences

- Les règles sont simples, le script reste déterministe, et le canary vérifie que le sync est
  idempotent.
- Le lock ne garde pas ce que le kit a écrit. Un sync ne distingue donc pas un fichier modifié par
  le projet d'un fichier modifié par le kit. Constaté le 13/10/2026 sur workout-manager : un
  `ci.yml` corrigé à la main serait écrasé, et des seeds supprimés seraient recréés. Le modèle de
  sync est repris par #16 et #17.
- Un fichier managed n'a pas de point d'extension : un projet qui doit l'adapter le contourne, comme
  `ci.yml` et `scripts.typecheck` dans workout-manager.
- La fusion de `merge/` additionne les tableaux : une valeur retirée par le projet revient au sync
  suivant.
- Le seul patch existant (tokens de contraste dans `globals.css`, module `a11y`) ne s'applique qu'à
  la création. Un correctif de ce type n'atteint pas un projet existant (#4).
