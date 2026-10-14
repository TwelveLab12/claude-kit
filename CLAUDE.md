# CLAUDE.md

Repo du plugin Claude Code **claude-kit** : scaffold interactif et conventions partagées des
projets TwelveLab12. Voir [README.md](README.md) pour l'architecture (managed/seed/merge/rules,
lockfile, canary).

## Commandes

```bash
node scripts/apply.mjs list                                  # catalogue des modules
node scripts/apply.mjs create <tmp> --modules all --var owner=TwelveLab12 --var boardNumber=1
node scripts/apply.mjs apply <projet> --from-lock --dry-run  # plan d'un sync
node --check scripts/*.mjs                                    # syntaxe
node --test "test/*.test.mjs"                                 # tests rapides, sans réseau ni dépendance
node --test --test-update-snapshots "test/*.test.mjs"         # régénère les instantanés après un changement voulu
node scripts/check-release.mjs                                # version et CHANGELOG de la branche vs origin/main
```

Tests rapides ([test/](test/)) : `node:test` seul, projets d'exemple dans `test/fixtures/`, faux
`gh` dans `test/fakes/` (enregistre les appels, répond selon un scénario). `apply.mjs` est importable
(il ne lance sa commande que s'il est le point d'entrée) ; `board.mjs` se teste en sous-processus.
Le `ci.yml` rendu est figé dans `test/apply.test.mjs.snapshot` : un changement de `renderCi` se
relit dans le diff de ce fichier.
Un nouveau comportement du script vient avec son test, et un test doit échouer si on introduit le
défaut. Workflow CI : `.github/workflows/test.yml`.

Tester un changement : générer un projet jetable hors du repo (ex. `$(mktemp -d)/canary`), y lancer
typecheck, format:check, lint:ci, test, build, test:e2e, puis `apply . --from-lock --no-install`
doit renvoyer `written: []` (idempotence). C'est exactement ce que fait le canary en CI.

Environnement : tout l'outillage (git, gh, node, pnpm via Volta) tourne dans WSL, et les repos sont
dans le système de fichiers Linux (`~/Projects`), pas sous `/mnt/c`. Le kit doit rester portable
(scripts Node sans dépendance, `gh` pris dans le PATH) : le canary tourne sous Linux.

## Conventions

- Scripts Node **sans dépendance** (ESM, `node:` uniquement) : le plugin doit tourner sur un
  poste sans `pnpm install` préalable.
- Tout ce qui est mécanique va dans `scripts/apply.mjs` ; les skills ne font que dialoguer,
  décider et écrire le spécifique au projet. Une règle qu'on ne peut pas tester en CI n'a pas sa
  place dans le script.
- Contenu d'un module : fichier possédé par le kit → `managed/` ; possédé par le projet une fois
  créé → `seed/` ; JSON partagé → `merge/`. En cas de doute, `seed/` (un sync ne doit jamais
  écraser une personnalisation).
- Templating : `{{var}}` et `{{#if moduleOuVar}}…{{/if}}` (non imbriqué ; `a+b` = tous vrais).
  Fichier qui dépend d'autres modules → dossier `seed@a+b/`, pas de logique dans le script.
- `patches` : remplacements **littéraux** uniquement, et un test du projet doit échouer si le
  patch ne s'applique plus (ex. contraste des tokens). Jamais de regex « tolérante ».
- Tester qu'un contrôle détecte vraiment : introduire le défaut dans un projet généré et vérifier
  l'échec, pas seulement que le projet sain passe.
- Ne pas figer de version dans un module : ce qui vient avec Next est laissé à `create-next-app`,
  le reste est installé en `@latest`. Un standard qui change se traite dans le module concerné.
- Décision structurante du kit → ADR dans [docs/adr/](docs/adr/), au format du module `docs-adr`.
  Les lire avant un changement qui pourrait en contredire un : un ticket qui contredit un ADR passe
  d'abord par un nouvel ADR.
- Une PR qui modifie le plugin (`modules/`, `skills/`, `scripts/`, `agents/`, `hooks/`,
  `.claude-plugin/`) monte `version` dans `.claude-plugin/plugin.json` au-dessus de celle de `main`
  (semver : majeure si un sync demande une action manuelle, patch si rien ne change pour les
  projets) et ajoute l'entrée `## <version>` au `CHANGELOG.md`. Vérifié en CI par
  `scripts/check-release.mjs` (pas encore obligatoire : dépôt privé, donc CI verte exigée avant
  tout merge) ; le merge pose le tag `v<version>` (ADR 0005).
- Règles (`rules.md`) en français, courtes, impératives, avec le *pourquoi* quand il n'est pas
  évident.
- Workflow Git : celui du module `github-workflow` (issue, branche, PR, squash-merge). Board du
  kit : project n°4 de `TwelveLab12`, organisé en milestones (Fondations, Fiabilité, Versions).
  Le kit n'a pas de `kit.lock.json` : passer `--owner TwelveLab12 --project 4` à `board.mjs`.

## Retours des projets

Un problème rencontré dans un projet qui utilise le kit se trie dans cet ordre :

1. Le projet a dû contourner un fichier ou une règle du kit, ou le défaut se reproduit sur un
   projet généré → issue `bug` sur le kit, tout de suite : le prochain sync effacerait le
   contournement.
2. Cause extérieure et passagère (panne GitHub, miroir apt, registre npm) → relancer une fois. Si
   ça échoue encore, noter une occurrence sur le signalement de ce symptôme (formulaire
   « Signalement », label `signalement`), en le créant s'il n'existe pas. Un ticket seulement si
   le symptôme revient, ou si le kit aurait dû l'absorber (délai maximum, réessai, message clair).
3. Problème propre au projet → il reste dans le projet. Il devient candidat pour le kit quand un
   deuxième projet le rencontre.

Une issue par symptôme : une nouvelle occurrence est un commentaire, pas une issue. Les
signalements ouverts sont tranchés (ticket ou clôture) à la revue de pertinence qui clôt chaque
milestone.
