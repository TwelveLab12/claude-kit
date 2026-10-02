---
name: start-task
description: Démarre une tâche selon le workflow GitHub du kit — issue avec son label de type (et le label thématique accessibility si besoin), ajout au board, branche dédiée à jour de main. Sait aussi ranger une idée en Backlog sans démarrer. À utiliser dès que l'utilisateur demande un développement, un correctif ou une modification dans un projet qui suit ce workflow, avant d'écrire du code, ou quand il veut noter une tâche pour plus tard.
argument-hint: "<titre ou description de la tâche> [#issue existante] [--backlog | --todo]"
---

# /claude-kit:start-task

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`). Owner, board et
noms de statuts viennent de `.claude/kit.lock.json` (`vars`).

## Trois intentions

- **Démarrer maintenant** (défaut) : issue → board « En cours » → branche → travail.
- **Noter pour faire** (`--todo`, ou « ajoute une issue pour… ») : issue → board « À faire ». Pas de
  branche.
- **Garder en mémoire sans engagement** (`--backlog`, ou « plus tard », « à réfléchir », « quand X
  sera fait ») : issue → board « Backlog ». Le corps de l'issue dit **pourquoi elle attend**
  (prérequis, temps, relecture critique) et ce qui la fera passer en « À faire ». Ne jamais ranger
  en Backlog par défaut : c'est un choix explicite de l'utilisateur.

## Étapes

1. **Issue**
   - Numéro fourni (`#12`) → `gh issue view 12` et reprendre son titre et ses labels. Une issue
     existante en Backlog qu'on démarre passe directement en « En cours ».
   - Sinon, chercher un doublon (`gh issue list --search "<mots-clés>" --state open`), puis créer :
     `gh issue create --title "<titre>" --body "<contexte, critères de fin>" --label <type>`.
   - Type = exactement un parmi `bug`, `enhancement`, `documentation`, `chore`. Le déduire de la
     demande ; en cas de doute réel, demander. Si la tâche touche l'accessibilité et que le label
     `accessibility` existe, l'ajouter **en plus** (`--label <type> --label accessibility`).
2. **Board** : `node "$KIT/scripts/board.mjs" add <url-issue> --status <doing|todo|backlog>`.
   Erreur de scope → demander à l'utilisateur de lancer `gh auth refresh -s project` lui-même,
   puis réessayer.
3. **Branche** (démarrage seulement) : arbre propre requis (sinon demander quoi faire des
   changements en cours). `git fetch origin && git switch -c <prefix>/<n>-<slug> origin/main`, avec
   `prefix` = `fix` (bug), `feat` (enhancement), `docs` (documentation), `chore` (chore) et
   `slug` = 3 à 5 mots du titre en kebab-case ASCII.
4. Annoncer en une ligne : issue (lien), statut board, branche le cas échéant. Puis faire la tâche.
