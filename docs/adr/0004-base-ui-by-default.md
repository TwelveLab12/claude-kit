# 0004 — Base UI par défaut pour un nouveau projet, bibliothèque existante conservée

**Statut** : Acceptée (décision de la 0.3.0, 02/10/2026 ; consignée le 13/10/2026)

## Contexte

shadcn utilise désormais Base UI par défaut (preset `base-nova`). Le kit imposait Radix et
interdisait Base UI. Or des projets existants sont sur Radix, comme dnd-character-manager, et
remplacer la bibliothèque de primitives d'un projet en place reviendrait à réécrire ses composants.

## Décision

- **Nouveau projet** : la variable `uiBase` (`base` | `radix`) vaut Base UI par défaut. Elle est
  passée à `shadcn init -b` et inscrite dans le lock. Le scaffold pose la question.
- **Projet existant** : la bibliothèque installée (`@base-ui/react`, ou `radix-ui`/`@radix-ui/*`)
  est détectée et conservée, jamais remplacée.
- Les règles, le contrôle de dépendance et les commandes shadcn suivent la bibliothèque du projet.

## Conséquences

- Un nouveau projet suit le défaut de shadcn : ses composants et sa documentation correspondent à
  ce que génère la CLI.
- Les projets existants ne sont pas cassés par un changement de défaut.
- Le kit maintient deux variantes dans ses règles et ses contrôles, alors que le canary ne teste que
  la variante par défaut (Base UI).
