# Changelog

Chaque version est lue par `/claude-kit:sync` pour expliquer à un projet ce qui change.

## 0.3.0 — 2026-10-02

Retours d'expérience de BrunoSchvartzDev (chantier accessibilité #99 à #129, board #132).

### Board

- Colonne **Backlog** avant « À faire » (variable `statusBacklog`) et règles d'usage : on y gare une
  issue sans engagement en disant pourquoi elle attend, une nouvelle issue arrive en « À faire ».
- **Un board par dépôt.** `board.mjs init --repo <owner/nom>` crée (ou réutilise) le board, configure
  les 4 colonnes et le lie au dépôt, puis liste les workflows intégrés à activer à la main (pas
  d'API). `board.mjs` accepte l'alias `backlog`.
- `/claude-kit:start-task` sait noter une tâche sans la démarrer (`--todo`, `--backlog`) et ajoute
  le label thématique `accessibility` en plus du label de type. `/claude-kit:ship-task` laisse les
  workflows du board passer la carte en « Terminé » et transforme les suites repérées en issues.
- Label `accessibility` (thématique, jamais à la place du type) quand le module `a11y` est actif.

### Accessibilité

- ESLint : `Link` et `Image` de Next déclarés à jsx-a11y (`settings.components`), et la règle
  `alt-text` pour `Image` rétablie : le preset strict l'écrasait, et ces composants échappaient en
  partie aux règles.
- `docs/accessibility.md` : couverture RGAA par thématique (automatique, lecture du code, test
  manuel, applicabilité), checklist de tests manuels gratuits, écarts ouverts.
- ADR « stratégie accessibilité » (création de projet uniquement) : trois couches, et pas de
  déclaration publiée sans obligation légale ni audit formel.
- Règles Claude enrichies : lien d'évitement et `id` du `<main>`, landmarks hors de `<main>`, `nav`
  nommées, libellé constant des boutons à bascule, cible d'`aria-controls` gardée dans le DOM,
  zones défilantes focalisables, composant unique pour le Markdown, SVG informatifs (description,
  légende, contraste mesuré à la main), focus non masqué par un en-tête collant, `rem`, couleur
  d'erreur mesurée, saisie conservée après un échec (`<form action>` de React 19).
- e2e : règles « best-practice » d'axe en plus de WCAG, page 404 auditée, tests tagués `@a11y`.
- Option `a11yGate=advisory` : pour un projet existant avec de la dette, les tests `@a11y` passent
  dans un job CI séparé, non bloquant (`continue-on-error`), le temps de la résorber.
- Test de contraste : lit aussi les blocs `@theme` (palettes Tailwind v4 en hexadécimal), paires
  propres au projet à déclarer dans le test.
- `/claude-kit:a11y-audit` met à jour `docs/accessibility.md`, vérifie la sortie du RGAA 5, et ne
  génère une déclaration qu'après avoir vérifié l'obligation légale.
- Agent `a11y-reviewer` : contrôles ajoutés (focus rendu au déclencheur, libellé constant,
  conteneurs défilants, saisie perdue, SVG informatifs, défilement fluide hors `no-preference`).
- Playwright sous Linux/WSL : consigne d'installation des bibliothèques système de Chromium.

### Socle

- Règle « faits dérivés » : un chiffre qui se déduit d'une source du dépôt est calculé, jamais
  tapé en dur.

Pour un projet existant : `/claude-kit:sync`. Le nouveau `docs/accessibility.md` est créé s'il
manque ; la config ESLint avec le mapping de composants apparaît dans `seedDiffers` ; les règles du
board passent à 4 colonnes (le board doit avoir la colonne Backlog : `board.mjs init` ne la crée que
sur un board qui n'a pas encore les colonnes du kit).

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
