---
name: sync
description: Met à jour un projet déjà équipé par claude-kit vers la version courante du kit (règles Claude, CI, configs gérées), ou ajoute/retire un module. À utiliser quand l'utilisateur demande de synchroniser le kit, quand le hook de démarrage signale un kit plus récent, ou pour ajouter un module (ex. Playwright) à un projet existant.
argument-hint: "[+module] [-module]"
---

# /claude-kit:sync

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`).

1. **Prérequis** : `.claude/kit.lock.json` existe (sinon → `/claude-kit:scaffold` en mode
   adoption). Arbre git propre. Si le projet suit le workflow GitHub du kit, créer l'issue (`chore`)
   et la branche avec `/claude-kit:start-task` **avant** de modifier quoi que ce soit.
2. **Ce qui change dans le kit** : comparer `kitVersion` du lock à `$KIT/.claude-plugin/plugin.json`
   et résumer les entrées concernées de `$KIT/CHANGELOG.md`.
3. **Dry-run** :
   `node "$KIT/scripts/apply.mjs" apply . --from-lock [--add a,b] [--remove c] --dry-run`
   (`+x` en argument → `--add x`, `-x` → `--remove x`). Présenter :
   - `written` : fichiers gérés par le kit qui vont changer (`managed/`, `.claude/kit/*.md`, CI,
     configs Prettier, bloc `.gitignore`, bloc d'imports de `CLAUDE.md`) ;
   - `installed` : dépendances manquantes qui seront ajoutées ;
   - `conflicts` : champs `package.json` qui diffèrent du kit (l'existant est conservé : proposer
     l'alignement seulement s'il est justifié) ;
   - `nodeTypes` : si `ok` vaut `false`, `@types/node` n'est pas à la majeure de Node (`nodeMajor`,
     lue dans `source`). Le sync ne le modifie pas : proposer
     `pnpm add -D @types/node@^<nodeMajor>` (avec Volta : `volta run pnpm add …`). Si `ok` vaut
     `null`, la majeure de Node est indéterminée (alias comme `lts/*` dans `.nvmrc`) : le dire, sans
     proposer de version ;
   - `seedDiffers` : fichiers possédés par le projet (tsconfig, eslint/vitest/playwright config…)
     qui diffèrent du modèle actuel. Comparer au fichier `proposal` et proposer **uniquement** les
     changements qui viennent du kit (nouvelle option, correctif), pas d'écraser les
     personnalisations du projet.
4. **Appliquer** après accord : même commande sans `--dry-run`, puis intégrer à la main les
   morceaux de `seedDiffers` retenus.
5. **Vérifier** : baseline (`.claude/kit/core.md`) + `format:check` (+ `test:e2e` si Playwright).
6. **Commits** : un commit pour les fichiers gérés (`chore: sync claude-kit <ancienne> → <nouvelle>`),
   un commit séparé par adaptation de fichier seed, puis `/claude-kit:ship-task`.

Ne jamais éditer un fichier géré dans le projet pour « corriger » le kit : si une règle ou une
config du kit est fausse, le noter pour une issue sur `TwelveLab12/claude-kit`.
