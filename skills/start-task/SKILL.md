---
name: start-task
description: Démarre une tâche selon le workflow GitHub du kit — issue avec son label de type, ajout au board en « En cours », branche dédiée à jour de main. À utiliser dès que l'utilisateur demande un développement, un correctif ou une modification dans un projet qui suit ce workflow, avant d'écrire du code.
argument-hint: "<titre ou description de la tâche> [#issue existante]"
---

# /claude-kit:start-task

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`). Owner, board et
noms de statuts viennent de `.claude/kit.lock.json` (`vars`).

1. **Issue**
   - Numéro fourni (`#12`) → `gh issue view 12` et reprendre son titre/label.
   - Sinon, chercher un doublon (`gh issue list --search "<mots-clés>" --state open`), puis créer :
     `gh issue create --title "<titre>" --body "<contexte, critères de fin>" --label <type>`.
   - Type = exactement un parmi `bug`, `enhancement`, `documentation`, `chore`. Le déduire de la
     demande ; en cas de doute réel, demander.
2. **Board** : `node "$KIT/scripts/board.mjs" add <url-issue> --status doing`. Erreur de scope →
   demander à l'utilisateur de lancer `gh auth refresh -s project` lui-même, puis réessayer.
3. **Branche** : arbre propre requis (sinon demander quoi faire des changements en cours).
   `git fetch origin && git switch -c <prefix>/<n>-<slug> origin/main`, avec
   `prefix` = `fix` (bug), `feat` (enhancement), `docs` (documentation), `chore` (chore) et
   `slug` = 3 à 5 mots du titre en kebab-case ASCII.
4. Annoncer en une ligne : issue (lien), statut board, branche. Puis faire la tâche.
