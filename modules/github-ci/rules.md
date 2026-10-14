## CI

`.github/workflows/ci.yml` (géré par claude-kit, régénéré par `/claude-kit:sync`) lance sur chaque
push/PR vers `main` : {{ciSteps}}. Chaque job a un délai maximum (`timeout-minutes`). Une PR ne se
merge pas tant que la CI est rouge. La version de Node est la même qu'en local : {{#if volta}}l'épinglage Volta de `package.json`{{/if}}{{#if nodeFromNvmrc}}`.nvmrc`{{/if}}.
