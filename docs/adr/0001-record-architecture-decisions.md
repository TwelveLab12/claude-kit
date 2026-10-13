# 0001 — Consigner les décisions d'architecture

**Statut** : Acceptée

## Contexte

Le kit impose des ADR aux projets qu'il équipe (module `docs-adr`), mais n'en tenait pas lui-même.
Ses choix structurants (propriété des fichiers, versions, bibliothèque d'UI) n'étaient écrits que
dans le README, le CHANGELOG ou des messages de commit. Un ticket pouvait donc contredire une
décision sans que personne ne s'en aperçoive : #1 demande des versions que le kit laisse
volontairement à `create-next-app`.

## Décision

Le kit tient des Architecture Decision Records dans `docs/adr/`, au même format que ceux des
projets : un fichier par décision, numérotés séquentiellement, Statut / Contexte / Décision /
Conséquences. Une décision reconsidérée donne lieu à un **nouvel** ADR qui référence l'ancien,
jamais à une édition rétroactive.

Les décisions prises avant cet ADR sont consignées après coup (0002 à 0004), avec la version du
kit où elles ont été prises.

## Conséquences

Avant un changement structurel, on lit les ADR ; un ticket qui en contredit un passe d'abord par
un nouvel ADR. Les ADR ne touchent que le dépôt du kit : ils ne demandent pas de nouvelle version.
