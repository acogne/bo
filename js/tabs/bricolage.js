// Onglet Bricolage — liste à faire simple, logique partagée avec Jardin via TodoListTab.
// Exposé aussi en global `BricolageTab` pour que la homepage (app.js) affiche
// les mêmes tâches en attente via `BricolageTab.renderDashboardCard`.
const BricolageTab = TodoListTab.create({
  sheetName: CONFIG.SHEETS.BRICOLAGE,
  accent: 'bricolage',
  title: 'Bricolage'
});

(function registerBricolageTab() {
  TabRegistry.register('bricolage', BricolageTab);
})();
