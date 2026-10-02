## Commandes

Toujours passer par `{{run}} <script>`{{#if volta}}, jamais `pnpm` nu. L'alias shell `vrp` est
équivalent, mais il n'existe pas dans le shell non interactif de Claude : y écrire la forme longue{{/if}}.

```bash
{{run}} dev          # serveur de dev (Turbopack)
{{run}} build        # build de production
{{run}} start        # sert le build de production
{{run}} typecheck    # next typegen && tsc --noEmit
```

`next typegen` est nécessaire avant `tsc` : les helpers `LayoutProps`/`PageProps` ne sont générés
qu'au dev/build/typegen, et sans eux `tsc` échoue sur un clone frais.

**Baseline avant tout commit** (c'est ce que la CI vérifie, ce n'est pas optionnel) :
{{baselineChecks}}.

## TypeScript

Strict : `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax` (imports de type toujours via `import type`),
`forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch`. Ne jamais relâcher une option du
`tsconfig.json` pour faire passer du code : corriger le code.

## Next.js

La version installée peut être plus récente que tes connaissances : lire le guide concerné dans
`node_modules/next/dist/docs/` avant d'utiliser une API dont tu n'es pas sûr (voir `AGENTS.md`).

## Faits dérivés

Un chiffre ou un fait affiché qui se déduit d'une source déjà présente dans le dépôt (une date, un
dossier, une liste) est **calculé** au build ou au rendu, jamais tapé en dur : il serait exact
aujourd'hui et faux demain (« 5 ans d'expérience », « 12 décisions documentées »…). Avant d'écrire
un nombre, vérifier s'il est dérivable. Exception : un contenu daté par nature (article publié,
changelog) reste un instantané.
