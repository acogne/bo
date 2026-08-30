// Onglet Jardin — liste à faire simple, logique partagée avec Bricolage via TodoListTab.
(function registerJardinTab() {
  TabRegistry.register('jardin', TodoListTab.create({
    sheetName: CONFIG.SHEETS.JARDIN,
    accent: 'jardin',
    title: 'Jardin'
  }));
})();
