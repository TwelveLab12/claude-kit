# 0005 — Une version du kit désigne un seul code

**Statut** : Acceptée (13/10/2026, #15)

## Contexte

Le hook de démarrage et `/claude-kit:sync` comparent le `kitVersion` du lock à la `version` de
`.claude-plugin/plugin.json` : ils supposent qu'une version désigne toujours le même code. Le cache
du plugin est lui aussi rangé par version (`~/.claude/plugins/cache/twelvelab/claude-kit/<version>/`).
Or trois commits ont été livrés après la 0.3.0 sans nouvelle version : un poste qui avait déjà la
0.3.0 ne les recevait probablement pas (supposé, non testé), et rien ne permettait de retrouver le
code d'une version.

## Décision

- Une PR qui modifie un fichier du plugin (`modules/`, `skills/`, `scripts/`, `agents/`, `hooks/`,
  `.claude-plugin/`) monte `version` au-dessus de celle de `main` et ajoute l'entrée `## <version>`
  au `CHANGELOG.md`, même si rien ne change pour les projets (version patch, « Aucune action »).
- Une version inférieure à celle de `main` est toujours refusée.
- `scripts/check-release.mjs` le vérifie sur chaque PR (job `release-check`). Au push sur `main`,
  le workflow `Release` pose le tag `v<version>` s'il n'existe pas.
- Le check est obligatoire sur `main`, avec le job `test`, depuis le passage du dépôt en public
  (14/11/2026, #22) : un dépôt privé gratuit n'a pas de protection de branche. Avant, seul
  `/claude-kit:ship-task` exigeait une CI verte avant de merger.

## Conséquences

- Chaque version publiée a un tag, donc un commit précis : on peut comparer deux versions et
  retrouver le code installé sur un poste.
- Une PR qui ne touche que `docs/`, `test/` ou `.github/` ne crée pas de version.
- Deux PR ouvertes en parallèle qui montent la même version : la seconde, une fois rebasée, échoue
  au contrôle et doit monter à nouveau.
