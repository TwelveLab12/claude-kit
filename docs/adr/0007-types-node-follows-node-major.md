# 0007 — `@types/node` suit la majeure de Node

**Statut** : Acceptée (14/10/2026, #2)

## Contexte

L'ADR 0003 laisse à `create-next-app` les versions de ce qui vient avec Next, `@types/node`
compris. Or `create-next-app` installe `@types/node@^20` quelle que soit la version de Node du
projet (24 par défaut dans le kit), et Dependabot propose ensuite la dernière majeure publiée (25,
puis 26) : workout-manager#10 et workout-manager#140. Des types plus récents que Node laissent
passer au typecheck des API qui n'existent pas à l'exécution, et des types plus anciens font
refuser celles qui existent.

## Décision

- `@types/node` suit la majeure de Node telle que le projet l'exécute : `volta.node` dans
  `package.json`, sinon `.nvmrc`. C'est une exception à l'ADR 0003 pour ce seul paquet, qui reste
  valable pour le reste.
- À la création, le kit aligne `@types/node` sur cette majeure après `create-next-app`.
- `dependabot.yml` ignore les bumps majeurs de `@types/node`. Les mineures et les correctifs
  restent proposés.
- Sur un projet existant, un sync ne modifie jamais `@types/node` (ADR 0006) : le rapport
  d'`apply` le signale (`nodeTypes`), et `sync` et `audit` proposent la commande. Une majeure de
  Node indéterminée (alias comme `lts/*` dans `.nvmrc`) est signalée comme telle, jamais devinée.
- La majeure de `@types/node` change en même temps que l'épinglage de Node, dans la même PR.

## Conséquences

- Un projet neuf a des types qui décrivent son exécution, et Dependabot ne propose plus de
  majeure de `@types/node` hors de portée.
- Un projet resté en `^20` sur Node 24 n'est plus aligné par Dependabot : il faut le faire à la
  main, sur le signal du rapport.
- Changer de version de Node demande deux gestes. La règle `core` et le rapport d'`apply` le
  rappellent, mais aucun contrôle de la CI du projet ne le vérifie.
- Rien ne signale qu'une nouvelle LTS de Node est sortie : Dependabot ne lit ni `volta.node` ni
  `.nvmrc` (#27).
- Le remplaçant de l'ADR 0003, attendu avec #1, devra reprendre cette exception.
