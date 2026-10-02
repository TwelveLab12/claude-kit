# Changelog

Chaque version est lue par `/claude-kit:sync` pour expliquer à un projet ce qui change.

## 0.2.0 — 2026-09-28

Accessibilité : WCAG 2.2 AA, grille RGAA 4.1.2.

- Nouveau module `a11y` (coché par défaut) :
  - ESLint `jsx-a11y` en config strict (au lieu des quelques règles de `next/core-web-vitals`) ;
  - `test/a11y.ts` : axe-core dans Vitest, plus un test d'exemple sur la page d'accueil ;
  - test de contraste des tokens de `globals.css` (couples `--x`/`--x-foreground`, texte 4.5:1,
    anneau de focus 3:1, clair et sombre) ;
  - `e2e/a11y.spec.ts` + `e2e/routes.ts` : pour chaque route, axe WCAG 2.2 AA, reflow à 320 px,
    `lang`, `<title>`, hiérarchie des titres, focus visible à chaque arrêt clavier, titres uniques ;
  - correction à la création de deux tokens shadcn par défaut qui échouent en mode clair
    (`--muted-foreground` sur `--muted` 4.34:1, `--ring` 2.59:1) ;
  - règles Claude par thématique RGAA.
- Agent `a11y-reviewer` : revue RGAA/WCAG d'un diff, appelé par `/claude-kit:ship-task` quand
  l'UI change.
- Skill `/claude-kit:a11y-audit` + `scripts/a11y-snapshot.mjs` : audit d'une page par thématique
  RGAA, déclaration d'accessibilité en option.
- Module `playwright` : le smoke test axe couvre maintenant WCAG 2.1 et 2.2 (il s'arrêtait à 2.0).
- Scaffold : `lang` et `metadata.title` réglés selon le projet.
- Moteur : fichiers conditionnels (`seed@a+b/`), conditions composées (`{{#if a+b}}`), `patches`
  littéraux signalés quand ils ne s'appliquent plus.

Pour un projet existant : `/claude-kit:sync +a11y`. Les nouveaux fichiers sont des seeds, donc
créés seulement s'ils manquent. `eslint.config.mjs` existant n'est pas modifié : la proposition
avec jsx-a11y apparaît dans `seedDiffers`.

## 0.1.0 — 2026-09-28

Première version, extraite de BrunoSchvartzDev, dnd-character-manager et ts-project-template.

- Modules : core, tailwind-shadcn, eslint, prettier, husky, vitest, playwright (nouveau : e2e +
  audit axe), docs-adr, github-ci, vercel-check, dependabot, github-workflow, claude-settings
  (nouveau).
- Par rapport aux projets existants :
  - `format:check` en CI ;
  - Node lu depuis `.nvmrc` (24, LTS active) au lieu de 22 en dur ;
  - `.gitattributes` force LF partout, plus seulement sur `.husky/*` ;
  - lint-staged couvre aussi `js/mjs` et `yml` ;
  - templates d'issue et de PR ;
  - workflow GitHub (labels, board) écrit une seule fois dans le kit au lieu d'être renvoyé par
    lien vers BrunoSchvartzDev ;
  - `scripts/board.mjs` pour mettre à jour le board sans manipuler d'IDs GraphQL.
