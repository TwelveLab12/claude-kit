# 0008 — Sync à trois voies : le projet garde la base de ce que le kit a écrit

**Statut** : Acceptée (14/10/2026, #16). Modifie l'ADR 0002 sur un point : un fichier managed
modifié par le projet n'est plus réécrit.

## Contexte

Dry-run du 13/10/2026 sur workout-manager, kit 0.3.0 sur un projet en 0.3.0
(`apply . --from-lock --dry-run --no-install`) :

- les tests d'exemple que le projet avait supprimés (workout-manager#25) seraient recréés ;
- `ci.yml` serait réécrit : `actions: read`, ajouté à la main, disparaîtrait, et
  `upload-artifact` repasserait de v6 (Dependabot) à v5 ;
- le lock serait réécrit chaque jour, parce que `updatedAt` prend la date du jour ;
- 8 `seedDiffers` et un conflit sur `scripts.typecheck` sont signalés, et aucun ne vient du kit.

Le lock garde les modules et les variables, pas ce que le kit a écrit (conséquence notée dans
l'ADR 0002). Le sync ne distingue donc pas un fichier modifié par le projet d'un fichier modifié
par le kit, et le skill sync demande à Claude de deviner. C'est contraire à l'ADR 0006, selon lequel
la mécanique tourne dans les scripts, sans IA. L'ADR 0006 exige aussi qu'un sync ne fasse jamais
redescendre une version, y compris celle d'une action GitHub dans un fichier managed, alors que
Dependabot monte celles de `ci.yml`.

## Décision

### La base

- Après chaque `create` et chaque `apply` réel (jamais en dry-run), le kit écrit
  `.claude/kit/base.json`. Ce fichier contient tout ce que le kit a rendu à ce passage, qu'il l'ait
  écrit ou seulement proposé :
  - le contenu des fichiers managed et seed, après passage par le Prettier du projet ;
  - le corps des blocs (`.gitignore`, `CLAUDE.md`) ;
  - les valeurs des clés de `package.json` que le kit fournit (scripts, `type`, `lint-staged`) ;
  - la contribution de chaque fichier `merge/`.

  Les fichiers `fresh/` et les patches n'y entrent pas.
- Un changement du kit proposé une fois et refusé ne revient donc pas au sync suivant.
- La base est versionnée avec le projet et possédée par le kit, qui la marque `linguist-generated`
  dans `.gitattributes` pour que GitHub la replie dans le diff des PR.
- Pourquoi un fichier dans le projet :
  - Reconstruire la base depuis le tag au moment du sync demanderait le réseau à chaque fois. Le
    cache du plugin n'a pas de `.git`, et le clone de la marketplace est superficiel (vérifié le
    14/10/2026).
  - La reconstruction ne redonnerait pas non plus le contenu exact. Le rendu dépend de l'état du
    projet au moment du sync : son Prettier, son `package.json` pour `docs/dependencies.md`, le
    texte autour des blocs.
  - Un seul fichier JSON, et pas des copies des fichiers : sinon `tsc`, ESLint et Vitest
    traiteraient des copies de `.ts` et de tests.
  - Des empreintes (environ 3 Ko) suffiraient à détecter un changement. Elles ne permettraient ni
    d'ignorer un reformatage (N1), ni de montrer au projet ce qu'il a modifié, ni de fusionner
    (partie 2) : il faudrait alors migrer vers les contenus.
  - Le poids reste modeste : environ 60 Ko pour les 39 fichiers que le kit écrit dans
    workout-manager (mesuré le 14/10/2026).

### La comparaison

Chaque élément (fichier, bloc, clé de `package.json`) est comparé dans trois versions : **B** (la
base), **P** (le projet) et **K** (le rendu actuel du kit). Le projet a touché l'élément si
P ≠ B, suppression comprise. Le kit l'a changé si K ≠ B. Deux règles s'appliquent avant de
comparer :

- **N1** : les trois versions passent par le Prettier du projet. Un reformatage n'est pas une
  modification.
- **N2** : dans un workflow managed (`.github/workflows/`), la référence des lignes `uses:` est
  ignorée. Pour chaque action, le kit écrit la plus haute des deux versions, celle du projet ou la
  sienne. Une montée par Dependabot n'est donc ni une modification du projet ni annulée par le
  sync (ADR 0006). Une référence non comparable (SHA, branche) compte comme une modification du
  projet.

### Les cas

Si P = K, rien n'est écrit, quels que soient B et le type de l'élément (cas **F0**). Sinon :

| Cas | Base | Projet | Kit | managed, bloc | seed | clé de `package.json` |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | absente | absent | — | écrit | écrit | ajoutée |
| F2 | absente | présent | — | écart signalé, version du kit proposée | proposé | conflit signalé |
| F3 | B | = B | ≠ B | réécrit | réécrit | mise à jour |
| F4 | B | ≠ B | = B | écart signalé, version du kit proposée | rien | rien |
| F5 | B | ≠ B | ≠ B | écart signalé, version du kit proposée | proposé | conflit signalé (B, P, K) |
| F6 | B | supprimé | — | écart signalé, pas recréé | rien, pas recréé | rien, pas réajoutée |

- Un **écart** est signalé à chaque sync tant qu'il existe : un fichier managed modifié est une
  anomalie à trier (voir « Point d'extension »). Une modification de seed ou de clé de
  `package.json` est normale : elle n'est signalée que si le kit a changé de son côté.
- **merge/** (`.claude/settings.json`) : en partie 1, le comportement actuel reste (union des
  tableaux, l'existant gagne), et la base est enregistrée (**M1**). En partie 2, la comparaison se
  fait à trois voies, clé par clé et élément par élément. Un élément retiré par le projet n'est pas
  réajouté ; un élément retiré par le kit est retiré du projet s'il y est encore ; un élément
  ajouté par le kit est ajouté.

### La version et le lock

- **V1** : un sync dont le kit est plus ancien que le `kitVersion` du lock est refusé, dry-run
  compris, avec un message qui demande de mettre à jour le plugin.
- **V2** : un sync avec la même version reste permis (sync répété, ajout ou retrait de module).
- **V3** : un second sync n'écrit rien, lock et base compris. `updatedAt` est retiré du lock :
  aucun script ne le lit, et l'historique git du lock donne la date.

### L'amorçage

- **A1** : un projet qui a un lock mais pas de base, c'est-à-dire créé avant cet ADR, passe un
  premier sync sans base. Ce sync n'écrase rien et ne crée rien :
  - un élément présent qui diffère du kit relève de F2 (écart, proposition ou conflit) ;
  - un élément absent est signalé, pas écrit, puisqu'on ne sait pas s'il est nouveau dans le kit
    ou supprimé par le projet.

  La base est écrite à la fin de ce sync, et les suivants relèvent des cas F.
- **A2** : un projet sans lock (adoption) n'a pas de base non plus. Il relève des cas F1 et F2 : un
  fichier absent est écrit, un fichier que le projet possède déjà n'est jamais écrasé.
- La base n'est pas reconstruite depuis le tag `v<kitVersion>`. Cette option, envisagée le
  13/10/2026, demandait de récupérer le tag par le réseau et de rejouer l'ancien `apply.mjs` sur une
  copie du projet. C'était le plus gros morceau du chantier, pour un seul projet (workout-manager)
  et un seul passage. Le premier sync sans base coûte un passage plus bruyant, annoncé par le
  CHANGELOG, sans rien écraser ni recréer.

### Point d'extension des fichiers managed

- Le kit n'ajoute pas de mécanisme d'extension aux fichiers managed. Il y en a déjà deux :
  - les scripts de `package.json`, puisque la CI n'appelle que `pnpm <script>`. Ils appartiennent
    au projet dès qu'il les modifie (F4) ;
  - les fichiers propres au projet : un workflow de plus, un tsconfig de plus.
- Un fichier managed modifié reste un écart signalé (F4, F5, F6) jusqu'à ce qu'il soit tranché :
  - un défaut du kit donne une issue sur le kit (« Retours des projets », point 1) ;
  - un besoin propre au projet passe par un script.
- Un mécanisme comme le détachement d'un fichier attend qu'un deuxième projet en ait besoin.
- workout-manager : `actions: read` était un défaut du kit, corrigé en 0.4.0. `scripts.typecheck`
  est une personnalisation légitime (F4).

### Le partage du travail

- **Partie 1** (#17, Fondations) : base, N1, N2, cas F0 à F6, M1, V1 à V3, A1 et A2. Le skill sync
  s'appuie sur les catégories du rapport au lieu de deviner. Un canary de montée de version génère
  un projet avec le tag précédent et le synchronise.
- **Partie 2** (Fiabilité) :
  - fusion à trois voies des seeds en F5 avec `git merge-file` ;
  - `merge/` à trois voies ;
  - `--remove` : les fichiers du module retiré que le projet n'a pas touchés sont supprimés, les
    autres sont signalés ;
  - le cas d'un fichier que le kit ne rend plus.

## Conséquences

- Chaque cas (N1, N2, F0 à F6, M1, V1 à V3, A1, A2) a son test nommé dans #17. Le test actuel
  « un fichier géré modifié à la main est réécrit » s'inverse (F4).
- Premier sync de workout-manager, sans base (A1 ; supposé, à confirmer à la réception de #17) :
  - les fichiers managed que le kit a changés depuis la 0.3.0 sont signalés avec leur proposition,
    à reprendre une fois à la main : `ci.yml`, `dependabot.yml` et les règles `core`,
    `dependabot` et `github-ci` ;
  - les seeds que le projet a modifiés sont proposés, comme aujourd'hui, et `scripts.typecheck`
    est signalé une fois ;
  - les tests supprimés sont signalés, pas recréés.

  Les syncs suivants ne signalent plus que ce qui change. Le CHANGELOG de #17 doit annoncer ce
  premier passage, car le milestone se clôt sur ce sync.
- Un seed intact suit désormais le kit, valeurs par défaut comprises. Si `nodeVersion` change dans
  le manifeste, un `.nvmrc` intact change au sync suivant, ce que l'ADR 0006 exclut. `create`
  inscrit donc `nodeVersion` dans les variables du lock (#17).
- Un sync double son diff dans les PR, puisque la base change avec les fichiers. Comme elle est
  marquée `linguist-generated`, GitHub la replie.
- Changer la configuration Prettier du projet ne crée plus de faux écarts (N1).
- Un fichier managed modifié n'est plus réparé automatiquement. Il reste signalé jusqu'à ce qu'on
  tranche, ce qui demande une décision au lieu d'un écrasement silencieux.
