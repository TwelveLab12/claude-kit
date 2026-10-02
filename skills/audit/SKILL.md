---
name: audit
description: Vérifie la fraîcheur des standards — dans un projet, l'écart avec le kit et les dépendances obsolètes ; dans le repo claude-kit, l'écart entre les modules et l'écosystème actuel (Next.js, ESLint, TypeScript, Vitest, Playwright, Tailwind, shadcn, Node, GitHub Actions). À utiliser quand l'utilisateur demande si ses outils sont à jour, avant une montée de version majeure, ou périodiquement pour faire évoluer le kit.
---

# /claude-kit:audit

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`).

## Dans un projet (`.claude/kit.lock.json` présent)

1. Version du kit : lock vs `$KIT/.claude-plugin/plugin.json`.
2. Dérive : `node "$KIT/scripts/apply.mjs" apply . --from-lock --dry-run` → fichiers gérés modifiés
   à la main (`written`), `conflicts`, `seedDiffers`.
3. Dépendances : `pnpm outdated`. Distinguer patch/minor (Dependabot s'en charge) et **majeures**.
4. Rapport court : ce qui est à jour, ce qui dérive, ce qui mérite `/claude-kit:sync` ou une issue.
   Ne rien modifier.

## Dans le repo claude-kit (faire évoluer les standards)

1. **Versions** : `npm view <pkg> version` pour next, create-next-app, react, typescript, eslint,
   eslint-config-next, prettier, vitest, @playwright/test, tailwindcss, shadcn, husky, lint-staged,
   et la ligne LTS active de Node. Comparer avec ce que produit le canary.
2. **Compatibilité** : pour chaque majeure non adoptée, vérifier la compatibilité avec
   l'écosystème Next (peer deps d'`eslint-config-next`, support de TypeScript par Next…). Lire les
   notes de version / guides de migration officiels (WebFetch) : on n'adopte pas une majeure que
   `create-next-app` n'a pas encore adoptée sans raison forte.
3. **Pratiques** : ce qui a changé dans les recommandations officielles et qui touche un module
   (nouvelle option de config, flag de `create-next-app`, défaut du CLI shadcn, action GitHub
   dépréciée…). Chaque constat cite sa source.
4. **Canary local** : `node scripts/apply.mjs create <tmp> --modules all --var owner=TwelveLab12
   --var boardNumber=1`, puis baseline + `format:check` + `test:e2e` dans `<tmp>`.
5. **Proposer**, sans appliquer : une issue par évolution (label `enhancement` ou `chore`), avec
   module touché, changement, source et risque. L'implémentation suit ensuite le workflow normal
   (`/claude-kit:start-task`), avec bump de version dans `plugin.json` et entrée dans
   `CHANGELOG.md`.
