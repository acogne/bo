// Onglet Jardin — liste à faire simple, logique partagée avec Bricolage via TodoListTab.
// Exposé aussi en global `JardinTab` pour que la homepage (app.js) affiche
// les mêmes tâches en attente via `JardinTab.renderDashboardCard`.
const JardinTab = TodoListTab.create({
  sheetName: CONFIG.SHEETS.JARDIN,
  accent: 'jardin',
  title: 'Jardin'
});

(function registerJardinTab() {
  TabRegistry.register('jardin', JardinTab);
})();
