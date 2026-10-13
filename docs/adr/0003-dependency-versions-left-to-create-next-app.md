# 0003 — Versions des dépendances : celles de create-next-app, le reste en @latest

**Statut** : Acceptée (décision de la 0.1.0, 28/09/2026 ; consignée le 13/10/2026). À reconsidérer
dans le milestone Versions (#1).

## Contexte

`ts-project-template`, que le kit remplace, figeait des versions qui vieillissaient entre deux
mises à jour manuelles. Le kit doit produire un projet à jour sans tenir lui-même une liste de
numéros de version.

## Décision

- Ce qui vient avec Next (next, react, eslint, typescript, tailwind) est laissé à
  `create-next-app@latest`, qui choisit des versions compatibles entre elles.
- Le reste est installé en `@latest`.
- Aucune version n'est figée dans un module. Un standard qui change se traite dans le module
  concerné.
- Une majeure que `create-next-app` n'a pas encore adoptée ne l'est pas sans raison forte (skill
  audit).
- Le canary hebdomadaire vérifie que l'ensemble tient sur les dernières versions.

## Conséquences

- Le kit n'a aucun numéro de version à maintenir, et un projet neuf reste cohérent avec Next.
- Un projet neuf n'est pas forcément à la dernière version de chaque dépendance : Dependabot ouvre
  des PR dès la création (TypeScript 6, `@types/node`, voir #1 et #2).
- Les versions des actions GitHub sont écrites dans `scripts/apply.mjs`, en dehors de cette règle
  et hors de portée de Dependabot. Elles prennent donc du retard (#6).
- #1 contredit cette décision. Si la règle change, un nouvel ADR remplacera celui-ci.
