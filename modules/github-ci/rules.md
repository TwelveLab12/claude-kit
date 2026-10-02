## CI

`.github/workflows/ci.yml` (géré par claude-kit, régénéré par `/claude-kit:sync`) lance sur chaque
push/PR vers `main` : {{ciSteps}}. Une PR ne se merge pas tant que la CI est rouge. La version de
Node vient de `.nvmrc`.
