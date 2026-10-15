// Faux Prettier, copié dans node_modules d'un projet de test : sa seule mise en forme retire les
// espaces en fin de ligne. Suffit à vérifier que le sync compare après le Prettier du projet (N1).
module.exports = {
  getFileInfo: async () => ({ ignored: false, inferredParser: "fake" }),
  resolveConfig: async () => null,
  format: async (text) => text.replace(/[ \t]+$/gm, ""),
};
