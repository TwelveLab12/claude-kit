# Changelog

Chaque version est lue par `/claude-kit:sync` pour expliquer à un projet ce qui change.

## 0.10.0 — 2026-11-09

**Action possible, selon le `tsconfig.json` du projet.** Le sync ajoute `.next/dev/types` à son
`exclude` :

- `tsconfig.json` intact depuis le dernier sync : réécrit par le sync, rien à faire.
- `tsconfig.json` modifié par le projet (par exemple un `exclude` complété) : le sync propose la
  version du kit. Ajouter à la main `".next/dev/types"` à `exclude`, sans retirer
  `.next/dev/types/**/*.ts` d'`include`.

Le sync met aussi à jour la règle `.claude/kit/core.md`.

### Typecheck et build après `next dev` (#48)

- Après un `next dev`, `typecheck` et `build` échouaient sur `.next/dev/types/validator.ts`, serveur
  arrêté ou non, donc la baseline aussi. Deux défauts de Next en cause : des imports inutilisés que
  `noUnusedLocals` refuse dans une app sans route handler, depuis Next 16.4
  (vercel/next.js#99919), et un validateur périmé après la suppression d'une route
  (vercel/next.js#96620). `next build` vérifie les types avec `tsc` en ligne de commande, qui
  n'écarte pas ces fichiers.
- `tsconfig.json` (module `core`) exclut `.next/dev/types`. L'entrée d'`include` reste : Next la
  remet si elle manque. Les pages restent vérifiées par `.next/types`, que `next typegen` régénère
  avant `tsc`.
- Canary : `typecheck` et `build` passent après un `next dev` puis la suppression d'une route ; sans
  l'exclusion, `typecheck` doit échouer ; une page invalide doit faire échouer `typecheck`. Si l'une
  de ces deux dernières étapes échoue, Next a changé de comportement : réévaluer l'exclusion.

## 0.9.0 — 2026-11-08

**Aucune action manuelle.** Le sync met à jour les règles (`.claude/kit/core.md`, `playwright.md`,
`dependabot.md`, `github-workflow.md`), le template de PR et `dependabot.yml`, et ajoute le script
`test:e2e:ci` à `package.json`. Un label `github-actions` créé à la main pour Dependabot peut être
supprimé : `dependabot.yml` ne le pose plus.

Changement de pratique : la baseline avant la PR lance les e2e à chaque PR, en mode CI.

### Règles cohérentes avec la CI (#9)

- Baseline calculée à partir des étapes de la CI, à deux niveaux : avant chaque commit, toutes les
  étapes sauf le build et les e2e ; avant la PR, toutes. L'ancienne baseline omettait
  `format:check` et `test:e2e`, que la CI lance (PR rouge sur des e2e jamais lancés en local).
- `test:e2e:ci` (module `playwright`) : build de production, puis les e2e comme en CI
  (`next start`, un seul processus, deux réessais), avec un rapport lisible en local. La règle
  `playwright` donne `--repeat-each=3 --retries=0` pour repérer un test instable, et
  `/claude-kit:ship-task` le lance sur une spec ajoutée ou modifiée.
- Dependabot : merge en squash, comme toute PR. La règle demandait un merge commit, contraire au
  workflow.
- `dependabot.yml` ne pose plus le label `github-actions`, absent de `labels.json`.
- Règle « Retours vers le kit » (module `github-workflow`) : un problème qui vient peut-être du kit
  est un bug sur le kit, un signalement (cause extérieure et passagère) ou reste dans le projet.
- Tests : la baseline rendue couvre chaque étape de la CI, pour plusieurs combinaisons de modules ;
  les labels de `dependabot.yml` existent dans `labels.json`. Le canary lance `test:e2e:ci`.

## 0.8.0 — 2026-11-08

**Action possible : la CI e2e peut passer au rouge après le sync.** Le test de focus de
`e2e/a11y.spec.ts` mesure maintenant le contraste de l'indicateur. Un élément dont l'indicateur
reste sous 3:1 le fait échouer, avec son nom et le contraste mesuré. Cas connus :

- variante `destructive` du bouton shadcn (`focus-visible:border-destructive/40`, 2,12:1) :
  remplacer par `focus-visible:border-destructive` ;
- panneau d'onglet shadcn (`outline-none` sur `TabsContent`) : il échouait déjà, retirer
  `outline-none` pour que l'anneau global s'applique.

Le sync met à jour `e2e/a11y.spec.ts` s'il n'a pas été modifié (sinon il le propose), le
commentaire du bloc de `globals.css` et les règles `a11y` (`.claude/kit/a11y.md`).

### Indicateur de focus mesuré (#5)

- À chaque tabulation, le test compare deux captures de l'élément, avec et sans focus. Les pixels
  qui changent doivent contraster à 3:1 sur au moins 1 px (WCAG 1.4.11, RGAA 10.7). L'ancien test
  passait dès qu'un style changeait : un anneau à 1,96:1 passait.
- Halo translucide, contour, bordure, fond et pseudo-éléments sont mesurés tels qu'affichés, sur le
  fond réel. Un élément entièrement caché sous un en-tête ou un bandeau fixe échoue aussi
  (WCAG 2.4.11).
- Seuil AA. Le niveau AAA (WCAG 2.4.13, 2 px) est suivi dans #44.
- Canary : sans l'anneau global de `globals.css`, le test de focus doit échouer.
- Références : WCAG 2.4.11 (focus non masqué) remplacé par 1.4.11 là où il désignait le contraste
  de l'indicateur.

## 0.7.0 — 2026-11-08

**Aucune action manuelle.** Le premier sync après cette version écrit un bloc dans
`src/app/globals.css` (et met `.claude/kit/base.json` à jour), puis `written: []`.

### Anneau `:focus-visible` global (#4, ADR 0009)

- Le module `a11y` (avec `tailwind-shadcn`) installe l'anneau que sa règle annonçait déjà :
  `:where(a, button, input, textarea, select, summary, [tabindex="0"]):focus-visible` avec
  `outline: 3px solid var(--ring)` dans `@layer base`. Sans lui, le contour par défaut de shadcn
  (`outline-ring/50`) donne environ 2,2:1, sous le 3:1 de WCAG 1.4.11.
- Le bloc est placé entre `/* >>> claude-kit */` et `/* <<< claude-kit */` à la fin de `globals.css`.
  Il suit le sync à trois voies : intact, il suit le kit ; modifié, il est signalé (`drifts`) ; supprimé,
  il n'est pas recréé. Le reste du fichier reste au projet.
- Nouveau : un module peut avoir un dossier `block/` (ou `block@a+b/`) pour tenir un bloc dans une
  feuille de style du projet. Fichier hôte absent : rien n'est créé, `missing` (cas `H1`).
- Un projet qui a déjà son propre anneau le garde : supprimer le bloc suffit, il ne revient pas.

## 0.6.0 — 2026-10-15

**Premier sync après cette version : une reprise à la main, une seule fois.** Le projet n'a pas
encore de base (`.claude/kit/base.json`), et le kit ne sait donc pas ce qu'il y a écrit. Ce sync
n'écrase rien et ne crée rien ; le rapport l'indique par `bootstrap: "A1"`.

- Les fichiers managed que le kit a changés depuis la version du projet sont signalés dans
  `drifts` (cas F2), avec la version du kit (`proposal`). Ils sont à reprendre une fois à la main.
  Pour un projet en 0.3.0 : `.github/workflows/ci.yml`, `.github/dependabot.yml`,
  `.gitattributes` et les règles `core`, `dependabot` et `github-ci` (`.claude/kit/*.md`).
- Les éléments absents du projet (fichiers, scripts, bloc) sont signalés dans `missing`, pas
  recréés : le kit ne sait pas s'ils sont nouveaux ou si le projet les a supprimés. Les tests
  d'exemple supprimés par un projet ne reviennent plus.
- Les seeds et les scripts qui diffèrent du kit sont proposés (`proposals`) ou signalés
  (`conflicts`) une dernière fois.

La base est écrite à la fin de ce sync : les suivants ne signalent plus que ce qui change.

### Sync à trois voies (#17, ADR 0008)

- `.claude/kit/base.json` garde ce que le kit a écrit au dernier passage, après le Prettier du
  projet. Elle est versionnée avec le projet, et `.gitattributes` (module `core`) la marque
  `linguist-generated` : GitHub la replie dans le diff des PR.
- Chaque fichier, bloc (`.gitignore`, `CLAUDE.md`) et clé de `package.json` (`type`, `scripts.*`,
  `lint-staged`) est comparé dans trois versions : base, projet et kit. Le sync n'écrit que ce que
  le projet n'a pas touché :
  - un fichier managed modifié par le projet n'est plus réécrit. Il est signalé à chaque sync
    (`drifts`) jusqu'à ce qu'on tranche : issue sur le kit, ou script propre au projet ;
  - un seed intact suit le kit. Modifié, il n'est proposé que si le kit l'a changé aussi ;
  - un élément supprimé par le projet n'est pas recréé.
- Un reformatage n'est pas une modification. La version d'une action GitHub montée par Dependabot
  n'est ni un écart ni redescendue : le kit écrit la plus haute des deux.
- Rapport : `seedDiffers` est remplacé par `drifts`, `proposals` (seeds), `conflicts` (clés de
  `package.json`, avec `base`, `current` et `kit`) et `missing`. Chaque entrée porte son cas
  (F2 à F6, A1). Les propositions sont rangées en `kit/<fichier>` et `base/<fichier>` :
  `/claude-kit:sync` montre ce que le kit change sans deviner.
- Un kit plus ancien que celui du lock refuse de synchroniser, dry-run compris : mettre à jour le
  plugin.
- Le lock perd `updatedAt` et n'est réécrit que si son contenu change. Il inscrit `nodeVersion`
  s'il manque : un `.nvmrc` intact ne suit pas un nouveau défaut du kit.
- Adoption d'un projet sans lock : un fichier que le projet a déjà n'est plus écrasé, il est
  signalé. `package.json` n'est réécrit que si une clé change.
- Les plugins du Prettier du projet sont cherchés dans le projet. À la création, Prettier les
  cherchait dans le dossier courant (`prettier-plugin-tailwindcss` introuvable), et la mise en forme
  échouait sans message. Sous Node 24, Prettier lui-même, installé en cours de création, n'était
  pas retrouvé : Node garde en cache une résolution qui a échoué. Un paquet n'est donc cherché
  qu'une fois installé.

Dans le kit : un test nommé par cas de l'ADR 0008, un faux Prettier pour les tests, et un job
`upgrade` du canary qui synchronise un projet généré avec la version précédente du kit.

## 0.5.0 — 2026-10-14

Le sync réécrit `.github/dependabot.yml` et les règles `core` et `dependabot`. Aucune action si
`@types/node` est déjà à la majeure de Node (`nodeTypes.ok` vaut `true` dans le rapport). Sinon,
l'aligner avec la commande proposée : Dependabot ne proposera plus ce bump majeur.

- **`@types/node` suit la majeure de Node**, pas la dernière publiée (#2, ADR 0007). Un projet
  neuf reçoit `@types/node@^<majeure de Node>` (lue dans `volta.node`, sinon `.nvmrc`) à la place
  du `^20` de `create-next-app`.
- `dependabot.yml` ignore les bumps **majeurs** de `@types/node` : la majeure change avec
  l'épinglage de Node.
- Le rapport d'`apply` contient `nodeTypes` (`ok`, `nodeMajor`, `source`, `types`).
  `/claude-kit:sync` et `/claude-kit:audit` signalent `ok: false` et proposent la commande
  d'alignement. `ok: null` veut dire que la majeure de Node est indéterminée (alias comme `lts/*`
  dans `.nvmrc`), et rien n'est proposé. Un sync ne modifie jamais les dépendances d'un projet
  existant.

Dans le kit : le canary vérifie que le projet généré a `@types/node` à la majeure de `.nvmrc`
(sans Volta : le cas Volta est couvert par les tests rapides). ADR 0007.

## 0.4.0 — 2026-10-14

Le sync réécrit `.github/workflows/ci.yml`. Aucune action manuelle.

- **Vercel Deployment Check** : le job reçoit `actions: read` en plus de `statuses: write`.
  L'action de Vercel lit les jobs du run, et sans cette permission la CI était rouge dès le
  premier run (`Resource not accessible by integration`). Un projet qui avait ajouté
  `actions: read` à la main le retrouve dans le fichier généré : rien à refaire.
- **Délai maximum** : chaque job s'arrête au bout de 15 minutes (`timeout-minutes`), au lieu des
  360 minutes de GitHub. Une installation de Chromium bloquée échoue vite au lieu de laisser le
  check Vercel en attente.
- **Cache des navigateurs Playwright** (`~/.cache/ms-playwright`, clé sur la version de
  Playwright). `--with-deps` installe toujours les dépendances système.
- `actions/upload-artifact` passe de v5 à v7. Un projet que Dependabot avait monté en v6 passe en
  v7.

Dans le kit : un échec planifié du canary est relancé une fois (`canary-retry.yml`,
`scripts/canary-retry.mjs`). Si la relance échoue aussi, l'issue « Canary en échec » ouverte
reçoit un commentaire, ou est ouverte. Le `ci.yml` rendu est figé dans un instantané de test.

## 0.3.2 — 2026-10-13

Aucune action pour les projets : rien ne change dans ce qu'un sync écrit.

- Une PR qui modifie le plugin doit monter la version et compléter le CHANGELOG :
  `scripts/check-release.mjs`, job CI `release-check`. Le merge sur `main` pose le tag
  `v<version>` (workflow `Release`). Voir l'ADR 0005.

## 0.3.1 — 2026-10-13

Aucune action pour les projets : rien ne change dans ce qu'un sync écrit.

- Tests rapides du kit (`node --test "test/*.test.mjs"`, sans réseau ni dépendance) : gabarits,
  `deepMerge`, `renderCi`, `apply --from-lock` sur un projet d'exemple, `board.mjs` avec un faux
  `gh`. Workflow CI `Tests`, séparé du canary.
- `apply.mjs` exporte ses fonctions et ne lance sa commande que s'il est le point d'entrée.

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
- `not-found.tsx` accessible fourni (créé s'il manque) : la 404 par défaut de Next n'a pas de
  `<main>` (axe `landmark-one-main`, `region`). Le scaffold ajoute le lien d'évitement au layout.
- Option `a11yGate=advisory` : pour un projet existant avec de la dette, les tests `@a11y` passent
  dans un job CI séparé, non bloquant (`continue-on-error`), le temps de la résorber.
- Test de contraste : lit aussi les blocs `@theme` (palettes Tailwind v4 en hexadécimal), paires
  propres au projet à déclarer dans le test.
- `/claude-kit:a11y-audit` met à jour `docs/accessibility.md`, vérifie la sortie du RGAA 5, et ne
  génère une déclaration qu'après avoir vérifié l'obligation légale.
- Agent `a11y-reviewer` : contrôles ajoutés (focus rendu au déclencheur, libellé constant,
  conteneurs défilants, saisie perdue, SVG informatifs, défilement fluide hors `no-preference`).
- Playwright sous Linux/WSL : bibliothèques système de Chromium installées par `apt` seul sous
  `sudo`, la liste venant de `playwright install-deps --dry-run` lancé sans privilèges (un shim
  Volta ne fonctionne pas sous `sudo`).

### UI

- **Base UI ou Radix, au choix pour un nouveau projet**, Base UI par défaut : c'est désormais la
  base par défaut de shadcn (preset `base-nova`). Variable `uiBase` (`base` | `radix`), passée à
  `shadcn init -b`, inscrite dans le lockfile.
- **Projet existant** : la bibliothèque installée (`@base-ui/react` ou `radix-ui`/`@radix-ui/*`)
  est détectée et conservée, jamais remplacée. Les règles, le contrôle de dépendance et les
  commandes shadcn suivent la bibliothèque du projet. Avant, le kit imposait Radix et interdisait
  Base UI.

### Socle

- Règle « faits dérivés » : un chiffre qui se déduit d'une source du dépôt est calculé, jamais
  tapé en dur.
- **Volta** (`run=volta`) : la version de Node est épinglée dans `package.json` (`volta pin`, sans
  écraser un épinglage existant) et la CI la lit au même endroit (`node-version-file:
  package.json`). Plus de `.nvmrc` dans ce mode : avant, Volta utilisait sa version par défaut en
  local (22) pendant que la CI lisait `.nvmrc` (24). `.nvmrc` reste la source en mode `pnpm`.

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
