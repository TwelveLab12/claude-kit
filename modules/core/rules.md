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

**Baseline** : les étapes de la CI, lancées en local (ce n'est pas optionnel).

- Avant chaque commit : {{baselineCommit}}.
- Avant d'ouvrir une PR : {{baselinePr}}.{{#if playwright}} `test:e2e:ci` refait le build de
  production et lance les e2e comme la CI (voir `.claude/kit/playwright.md`).{{/if}}

Version de Node : {{#if volta}}épinglée par Volta dans `package.json` (champ `volta`), que Volta
applique en local et que la CI lit aussi. La changer avec `volta pin node@<version>`, jamais en
ajoutant un `.nvmrc` (deux sources finiraient par diverger).{{/if}}{{#if nodeFromNvmrc}}`.nvmrc`, lu
aussi par la CI.{{/if}} `@types/node` suit la majeure de Node (`{{run}} add -D @types/node@^<majeure>`
quand on change Node) : les types doivent décrire l'exécution, pas la dernière version publiée.

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
