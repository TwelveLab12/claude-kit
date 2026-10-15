// Faux Prettier, copié dans node_modules d'un projet de test : sa seule mise en forme retire les
// espaces en fin de ligne. Comme Prettier 3, la config est le .prettierrc.json le plus proche, et un
// plugin nommé est cherché depuis le dossier courant : par getFileInfo, qui relit la config sauf
// `resolveConfig: false`, et par format. Il doit donc arriver déjà résolu.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

async function resolveConfig(file) {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const config = path.join(dir, ".prettierrc.json");
    if (fs.existsSync(config)) return JSON.parse(fs.readFileSync(config, "utf8"));
  }
  return null;
}

function loadPlugins(plugins = []) {
  for (const plugin of plugins) createRequire(path.join(process.cwd(), "noop.js")).resolve(plugin);
}

module.exports = {
  resolveConfig,
  getFileInfo: async (file, options = {}) => {
    const config = options.resolveConfig === false ? null : await resolveConfig(file);
    loadPlugins([...(config?.plugins ?? []), ...(options.plugins ?? [])]);
    return { ignored: false, inferredParser: "fake" };
  },
  format: async (text, options) => {
    loadPlugins(options.plugins);
    return text.replace(/[ \t]+$/gm, "");
  },
};
