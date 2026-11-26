# 0011 — Version de Node : `.nvmrc` pour le poste et la CI, `engines.node` pour Vercel

**Statut** : Acceptée (26/11/2026, #27). Complète l'ADR 0007.

## Contexte

`.nvmrc` est la source de la version de Node d'un projet : la CI la lit (`setup-node`), et le
gestionnaire de Node du poste doit la lire (0.15.0, #35). Vercel ne la lit pas. Il suit le
réglage Node.js Version du projet, qui vit hors du dépôt, ou `engines.node` de `package.json`, qui
remplace ce réglage. workout-manager et dnd-character-manager sont réglés en `24.x`, comme leur
`.nvmrc` : la production est alignée par coïncidence.

Qui lit quoi (vérifié le 25/11/2026) :

| Source | mise (poste) | `setup-node` (CI) | Vercel (production) |
| --- | --- | --- | --- |
| `.nvmrc` | oui | oui | non |
| `devEngines.runtime` | oui | oui, en 2ᵉ | non documenté |
| `engines.node` | non | oui, en 3ᵉ | oui, à la place du réglage du projet |

Pour mise, c'est un essai de la version 2026.11.14 : dans un dossier sans `.nvmrc`, `engines.node`
à `22.x` laisse le défaut du poste (26), `devEngines.runtime` à `22.x` donne Node 22. `setup-node`
(v7.1.0, `node-version-file: package.json`) lit `volta.node`, puis `devEngines.runtime`, puis
`engines.node`. Pour Vercel, la source est sa documentation : « `26.x` causes Vercel to deploy with
the latest 26.x version ». Aucun champ n'est lu par les trois.

Rien ne signale non plus qu'une majeure de Node n'est plus la LTS active (#27, conséquence de
l'ADR 0007). Node 26 est la LTS active depuis le 28/10/2026, et Node 24 est en maintenance. Le kit
écrivait 24. Son canary tournait en `lts/*`, donc en 26, sur des projets générés en 24 : il ne
vérifiait pas le projet sur la version que le kit lui écrit.

Options pour Vercel :

- A, `engines.node` seul : écartée, mise ne le lit pas, et le poste tournerait sur son défaut ;
- B, `devEngines.runtime` pour le poste et la CI, `engines.node` pour Vercel : deux champs quand
  même, et nvm lit `.nvmrc`, pas `devEngines` (supposé) ;
- C, `.nvmrc` pour le poste et la CI, `engines.node` pour Vercel, alignés par le kit : retenue ;
- D, le réglage du tableau de bord à la main : écartée, c'est la coïncidence actuelle.

Pour la LTS, un appel réseau à nodejs.org depuis `apply` est écarté : les tests du kit tournent sans
réseau, et un sync ne doit pas dépendre d'un service extérieur.

## Décision

1. **`engines.node`** : le module `core` écrit `engines.node: "<majeure>.x"` dans `package.json`, à
   partir du même `nodeVersion` que `.nvmrc`. C'est une clé de `package.json` fournie par le kit,
   comparée à la base comme les scripts (ADR 0008). Un alias sans majeure (`lts/*`) n'en reçoit
   pas. Le format `<majeure>.x` fait déployer la dernière version de cette majeure. Une plage comme
   `>=24` laisserait Vercel prendre la plus haute majeure qu'il connaît.
2. **Alignement** : hors création, le rapport d'`apply` porte `nodeEngines` (`source`, `nodeMajor`,
   `engines`, `ok`). `ok` est faux si `engines.node` manque ou ne fixe pas la majeure déclarée
   (`24.x`, `^24` et `24.1.0` la fixent, `>=24` non). Sync et audit le signalent. Ce n'est jamais
   un échec, et le sync ne réécrit pas une valeur modifiée par le projet (ADR 0006).
3. **LTS** : le `nodeVersion` par défaut du kit suit la ligne LTS active de Node. `/claude-kit:audit`
   la vérifie dans le repo du kit, et une montée est une version du kit. Le rapport porte
   `nodeLts` (`source`, `nodeMajor`, `kitMajor`, `ok`) : un projet qui déclare une majeure plus
   ancienne que le défaut du kit est signalé à son sync. Le signal arrive avec la version du kit,
   sans réseau.
4. **Changer de majeure** : `/claude-kit:sync node=<majeure>` passe `--var nodeVersion=<majeure>`.
   Le lock l'enregistre, et `.nvmrc` et `engines.node` sont réécrits s'ils sont intacts (cas F3 de
   l'ADR 0008). `@types/node` est signalé par `nodeTypes` (ADR 0007). Un dry-run juge l'état
   qu'aurait le projet après le sync, pas celui du disque. Une PR par projet, avec l'aperçu Vercel
   validé avant le merge.
5. **Canary** : après la création, le projet généré passe sur le Node de son `.nvmrc` (seconde
   étape `setup-node`, dans les deux jobs). La création et le workflow `Tests` restent en `lts/*` :
   les scripts du kit doivent tourner sur la LTS active.
6. Le défaut du kit passe à **26**.

## Conséquences

- La production suit le dépôt : tant que `engines.node` est présent, le réglage du projet Vercel ne
  compte plus. Au premier sync, un projet dont ce réglage différait de `.nvmrc` change de version
  de Node en production au déploiement suivant. Ce n'est pas le cas de workout-manager ni de
  dnd-character-manager, en 24 des deux côtés.
- Deux champs décrivent la version. Leur écart n'est vu qu'au sync et à l'audit, pas par la CI du
  projet, comme pour `@types/node`.
- Un projet existant garde sa majeure (`nodeVersion` du lock, ADR 0006). Le passage en 26 se fait
  par une PR par projet, que `nodeLts` rappelle à chaque sync.
- pnpm avertit, sans échouer, quand le Node qui tourne ne satisfait pas `engines.node` (supposé,
  sans `engine-strict`). Le canary sur `.nvmrc` évite ce cas en CI.
- Si Vercel se met à lire `devEngines.runtime`, un seul champ servirait aux trois : à réexaminer.
- La dernière conséquence de l'ADR 0007 (« Rien ne signale qu'une nouvelle LTS de Node est
  sortie ») est couverte par `nodeLts`, au sync de chaque projet.
