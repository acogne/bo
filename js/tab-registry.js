// Registre central des onglets. Chaque fichier tabs/*.js s'enregistre ici au
// chargement ; app.js consulte ce registre pour le routing, sans jamais
// connaître le détail de chaque onglet.

const TabRegistry = (() => {
  const tabs = {};

  // config: { title, accent, render(container) }
  function register(route, config) {
    tabs[route] = config;
  }

  function get(route) {
    return tabs[route];
  }

  return { register, get };
})();
