---
name: sync
description: Met à jour un projet déjà équipé par claude-kit vers la version courante du kit (règles Claude, CI, configs gérées), ou ajoute/retire un module. À utiliser quand l'utilisateur demande de synchroniser le kit, quand le hook de démarrage signale un kit plus récent, ou pour ajouter un module (ex. Playwright) à un projet existant.
argument-hint: "[+module] [-module] [node=<majeure>]"
---

# /claude-kit:sync

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`).

1. **Prérequis** : `.claude/kit.lock.json` existe (sinon → `/claude-kit:scaffold` en mode
   adoption). Arbre git propre. Si le projet suit le workflow GitHub du kit, créer l'issue (`chore`)
   et la branche avec `/claude-kit:start-task` **avant** de modifier quoi que ce soit.
2. **Ce qui change dans le kit** : comparer `kitVersion` du lock à `$KIT/.claude-plugin/plugin.json`
   et résumer les entrées concernées de `$KIT/CHANGELOG.md`. Un kit plus ancien que le lock est
   refusé par le script : faire mettre à jour le plugin, ne pas contourner.
3. **Dry-run** :
   `node "$KIT/scripts/apply.mjs" apply . --from-lock [--add a,b] [--remove c] [--var nodeVersion=<n>] --dry-run`
   (`+x` en argument → `--add x`, `-x` → `--remove x`, `node=<n>` → `--var nodeVersion=<n>`). Lancer
   depuis la racine du projet. Changer la majeure de Node réécrit `.nvmrc` et `engines.node` s'ils
   sont intacts (ADR 0011 du kit) ; le dry-run juge déjà l'état d'après le sync.

   Le script compare chaque fichier, bloc et clé de `package.json` à la base
   (`.claude/kit/base.json`, ce que le kit a écrit au dernier passage) et classe le résultat. Ne
   rien deviner au-delà de ces catégories. Chaque entrée porte son cas (ADR 0008 du kit). Dans le
   dossier de propositions, `proposal` est la version du kit et `base` celle du dernier passage
   (absente sans base). `diff <base> <fichier>` montre ce que le projet a changé, `diff <base>
   <proposal>` ce que le kit change. Présenter :
   - `bootstrap: "A1"` : premier sync d'un projet créé avant la base. Rien n'est écrasé ni créé ;
     le dire, et annoncer que les syncs suivants ne signaleront plus que ce qui change ;
   - `written` : ce que le kit met à jour parce que le projet n'y a pas touché (élément nouveau,
     changement du kit), plus la base et le lock ;
   - `drifts` : fichiers managed ou blocs (`block`) que le projet a modifiés (F4), supprimés (F6),
     modifiés comme le kit (F5), ou qui diffèrent sans base (F2). Rien n'est écrasé, et l'écart est
     signalé à chaque sync tant qu'il existe. Le trancher avec l'utilisateur :
     - défaut du kit → issue `bug` sur `TwelveLab12/claude-kit` (« Retours vers le kit » de
       `.claude/kit/github-workflow.md`) ;
     - besoin propre au projet → un script de `package.json` ou un fichier propre au projet, puis
       reprendre la version du kit ;
     - changement du kit à reprendre (F2, F5) → copier `proposal` ;
   - `proposals` : seeds (fichiers du projet) que le kit a changés alors que le projet les a
     modifiés (F5), ou qui diffèrent sans base (F2). Proposer seulement les changements de
     `diff <base> <proposal>`, appliqués au fichier du projet. Sans base (F2), comparer au fichier,
     ne proposer que ce qui vient manifestement du kit, et dire que c'est une estimation ;
   - `conflicts` : clés de `package.json` (`scripts.*`, `type`, `lint-staged`) modifiées des deux
     côtés (F5, avec `base`, `current` et `kit`) ou qui diffèrent sans base (F2). La valeur du
     projet est conservée : proposer l'alignement seulement si le changement du kit le justifie.
     `uiBase` : la bibliothèque UI installée n'est pas celle du lock ;
   - `missing` (A1 seulement) : éléments absents du projet, ajoutés par le kit ou supprimés par le
     projet, ce que le script ne peut pas savoir. Demander pour chacun : le créer depuis `proposal`
     (`kit` pour une clé) ou le laisser absent. Un élément laissé absent est ensuite traité comme
     supprimé (F6) ;
   - `installed` : dépendances manquantes qui seront ajoutées ;
   - `nodeTypes` : si `ok` vaut `false`, `@types/node` n'est pas à la majeure de Node (`nodeMajor`,
     lue dans `source`). Le sync ne le modifie pas : proposer
     `pnpm add -D @types/node@^<nodeMajor>`. Si `ok` vaut `null`, la majeure de Node est
     indéterminée (alias comme `lts/*` dans `.nvmrc`) : le dire, sans proposer de version ;
   - `nodeRuntime` : si `ok` vaut `false`, le Node qui exécute le sync (`running`) n'est pas celui
     du projet (`nodeMajor`, lu dans `source`) : la baseline locale ne tournerait pas sur la version
     de la CI. Le dire : le gestionnaire de Node du poste doit lire `.nvmrc` (README du kit). Ne rien
     modifier dans le projet. Le contrôle ne vaut que lancé depuis la racine du projet (`apply .`).
     Avec `node=<n>`, un écart est attendu au dry-run : le poste passera sur la nouvelle majeure
     une fois `.nvmrc` écrit ;
   - `nodeEngines` : si `ok` vaut `false`, `engines.node` (`engines`) manque ou ne fixe pas la
     majeure déclarée (`nodeMajor`, lue dans `source`) : Vercel déploierait une autre version que la
     CI. Proposer `"engines": { "node": "<nodeMajor>.x" }`, sans l'écrire d'office : une valeur
     modifiée par le projet n'est pas réécrite ;
   - `nodeLts` : si `ok` vaut `false`, la majeure du projet (`nodeMajor`) est plus ancienne que le
     défaut du kit (`kitMajor`), qui suit la LTS active de Node. Le dire, et proposer une PR à part :
     sync `node=<kitMajor>`, `@types/node`, baseline sur cette version, aperçu Vercel validé ;
   - `deprecated` : options du lock dépréciées. `run=volta` : Volta n'est plus maintenu, le kit gère
     encore ce mode mais ne le propose plus. Le signaler, sans rien changer.
4. **Appliquer** après accord : même commande sans `--dry-run`, puis reprendre à la main ce qui a
   été retenu dans `drifts`, `proposals`, `conflicts` et `missing`.
5. **Vérifier** : baseline avant la PR (`.claude/kit/core.md`, tel que le sync vient de l'écrire).
6. **Commits** : un commit pour ce que le sync a écrit, base et lock compris
   (`chore: sync claude-kit <ancienne> → <nouvelle>`), un commit séparé par reprise à la main, puis
   `/claude-kit:ship-task`.

Ne jamais éditer un fichier géré dans le projet pour « corriger » le kit : si une règle ou une
config du kit est fausse, c'est une issue `bug` sur `TwelveLab12/claude-kit` (règle « Retours vers
le kit » de `.claude/kit/github-workflow.md`, ou « Retours des projets » du CLAUDE.md du kit).
