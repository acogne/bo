// Onglet Bricolage — liste à faire simple, logique partagée avec Jardin via TodoListTab.
(function registerBricolageTab() {
  TabRegistry.register('bricolage', TodoListTab.create({
    sheetName: CONFIG.SHEETS.BRICOLAGE,
    accent: 'bricolage',
    title: 'Bricolage'
  }));
})();
