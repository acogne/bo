// Init général + routing entre écrans (dashboard <-> onglets) + menu burger.

const ROUTES = {
  MENAGE: 'menage', COURSES: 'courses', JARDIN: 'jardin', BRICOLAGE: 'bricolage',
  ENFANT: 'enfant', CHAT: 'chat', BUDGET: 'budget', ADMIN: 'admin',
  CONTACTS: 'contacts', REPAS: 'repas', STOCK: 'stock', VEHICULE: 'vehicule',
  COMPTEURS: 'compteurs'
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  Auth.onAuthChange(renderAuthState);
  renderAuthState(Auth.getUser());

  document.getElementById('login-btn').addEventListener('click', () => Auth.login());
  document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

  document.getElementById('menu-btn').addEventListener('click', openMenu);
  document.getElementById('menu-close-btn').addEventListener('click', closeMenu);
  document.querySelectorAll('#menu-overlay a[href^="#/"]').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener('hashchange', renderRoute);

  registerServiceWorker();
});

function renderAuthState(user) {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const userLabel = document.getElementById('user-label');

  if (user) {
    loginView.hidden = true;
    appView.hidden = false;
    userLabel.textContent = user.email;
    renderRoute();
  } else {
    loginView.hidden = false;
    appView.hidden = true;
  }
}

function openMenu() {
  document.getElementById('menu-overlay').hidden = false;
}

function closeMenu() {
  document.getElementById('menu-overlay').hidden = true;
}

function currentRoute() {
  const hash = window.location.hash.replace(/^#\//, '');
  return hash || 'dashboard';
}

function renderRoute() {
  const container = document.getElementById('app-content');
  const route = currentRoute();

  if (route === 'dashboard') {
    renderDashboard(container);
    return;
  }

  const tab = TabRegistry.get(route);
  if (tab) {
    tab.render(container);
  } else {
    container.innerHTML = `
      <section class="tab-header">
        <h2>Bientôt disponible</h2>
        <p class="text-muted">Cet onglet n'est pas encore construit.</p>
      </section>
    `;
  }
}

async function renderDashboard(container) {
  container.innerHTML = `
    <section class="card dash-card">
      <h3>Cette semaine</h3>
      <p id="dash-week-info" class="text-muted">Chargement…</p>
    </section>
    <section class="card dash-card">
      <h3>Tâches du jour</h3>
      <div id="dash-today-tasks"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card" id="dash-compteurs-card" hidden>
      <h3>Compteurs à relever</h3>
      <div id="dash-compteurs-list"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card" id="dash-vehicule-card" hidden>
      <h3>Entretien véhicule</h3>
      <div id="dash-vehicule-list"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card">
      <h3>Alertes</h3>
      <p class="text-muted">Bientôt disponible (Calendrier).</p>
    </section>
    <section class="card dash-card">
      <a href="#/courses" class="btn">Accès rapide · Courses</a>
    </section>
  `;

  renderDashboardWeekInfo();
  renderDashboardTodayTasks();
  renderDashboardCompteurs();
  renderDashboardVehicule();
}

async function renderDashboardWeekInfo() {
  const el = document.getElementById('dash-week-info');
  try {
    const { rows } = await SheetsAPI.getRows(CONFIG.SHEETS.MENAGE_ROTATION);
    const currentWeek = DateUtils.isoWeekNumber(new Date());
    const row = rows.find((r) => DateUtils.parseWeekNumber(r['Semaine']) === currentWeek);

    if (!row) {
      el.textContent = 'Aucune rotation définie pour cette semaine.';
      return;
    }
    el.innerHTML = `Ménage : <strong>${row['Ménage'] || '?'}</strong> · Courses : <strong>${row['Courses'] || '?'}</strong>`;
  } catch (err) {
    console.error(err);
    el.textContent = 'Impossible de charger la rotation.';
  }
}

async function renderDashboardTodayTasks() {
  const el = document.getElementById('dash-today-tasks');
  try {
    const now = new Date();
    const [menageRes, dueMedicaments] = await Promise.all([
      SheetsAPI.getRows(CONFIG.SHEETS.MENAGE_TACHES),
      ChatTab.getDueMedicaments(now)
    ]);
    const todayTasks = menageRes.rows.filter((t) => {
      const freq = (t['Fréquence'] || '').trim().toLowerCase();
      return (freq === 'quotidien' || freq === 'hebdo') && TaskReset.isVisible(t, now);
    });

    const labels = [
      ...todayTasks.map((t) => t['Nom'] || ''),
      ...dueMedicaments.map((m) => ChatTab.formatMedicamentLabel(m))
    ];

    if (labels.length === 0) {
      el.innerHTML = '<p class="text-muted">Rien à faire aujourd\'hui 🎉</p>';
      return;
    }

    el.innerHTML = `<ul class="dash-task-list">${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`;
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="text-muted">Impossible de charger les tâches.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function renderDashboardCompteurs() {
  const card = document.getElementById('dash-compteurs-card');
  const el = document.getElementById('dash-compteurs-list');
  try {
    await CompteursTab.renderDashboardCard(card, el);
  } catch (err) {
    console.error(err);
    card.hidden = false;
    el.innerHTML = '<p class="text-muted">Impossible de charger les compteurs.</p>';
  }
}

async function renderDashboardVehicule() {
  const card = document.getElementById('dash-vehicule-card');
  const el = document.getElementById('dash-vehicule-list');
  try {
    await VehiculeTab.renderDashboardCard(card, el);
  } catch (err) {
    console.error(err);
    card.hidden = false;
    el.innerHTML = '<p class="text-muted">Impossible de charger l\'entretien du véhicule.</p>';
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.error('Échec enregistrement du service worker :', err);
    });
  }
}
