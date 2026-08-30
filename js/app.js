// Init général + routing entre écrans (dashboard <-> onglets) + menu burger.

const ROUTES = {
  MENAGE: 'menage', COURSES: 'courses', JARDIN: 'jardin', BRICOLAGE: 'bricolage',
  ENFANT: 'enfant', CHAT: 'chat', BUDGET: 'budget', ADMIN: 'admin',
  CONTACTS: 'contacts', REPAS: 'repas', STOCK: 'stock', VEHICULE: 'vehicule',
  COMPTEURS: 'compteurs'
};

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  updateThemeToggleIcon();

  Auth.init();
  Auth.onAuthChange(renderAuthState);
  renderAuthState(Auth.getUser());

  document.getElementById('login-btn').addEventListener('click', () => Auth.login());
  document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

  document.getElementById('refresh-btn').addEventListener('click', onRefreshClick);
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    ThemeManager.toggle();
    updateThemeToggleIcon();
  });

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

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  const isDark = ThemeManager.current() === 'dark';
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', isDark ? 'Passer en mode clair' : 'Passer en mode nuit');
}

function onRefreshClick() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.remove('icon-btn--spin');
  void btn.offsetWidth; // relance l'animation même si elle vient de tourner
  btn.classList.add('icon-btn--spin');
  renderRoute();
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
      <div id="dash-week-events"><p class="text-muted">Chargement des événements…</p></div>
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
  renderDashboardWeekEvents();
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
    el.innerHTML = `Ménage : <strong>${row['Ménage_assigné_à'] || '?'}</strong> · Courses : <strong>${row['Courses_assigné_à'] || '?'}</strong>`;
  } catch (err) {
    console.error(err);
    el.textContent = 'Impossible de charger la rotation.';
  }
}

function parseCalendarDate(start) {
  if (start.dateTime) return new Date(start.dateTime);
  const [y, m, d] = start.date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatEventLabel(event) {
  const start = event.start || {};
  const date = parseCalendarDate(start);
  const dayLabel = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  if (!start.dateTime) return dayLabel;
  const timeLabel = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel} · ${timeLabel}`;
}

async function renderDashboardWeekEvents() {
  const el = document.getElementById('dash-week-events');
  try {
    const events = await CalendarAPI.listUpcomingEvents({ days: 7 });

    if (events.length === 0) {
      el.innerHTML = '<p class="text-muted">Aucun événement dans les 7 prochains jours.</p>';
      return;
    }

    el.innerHTML = `<ul class="dash-task-list">${events.map((ev) => {
      const label = formatEventLabel(ev);
      const summary = ev.summary || '(Sans titre)';
      return `<li><strong>${escapeHtml(label)}</strong> — ${escapeHtml(summary)}</li>`;
    }).join('')}</ul>`;
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="text-muted">Impossible de charger les événements de l\'agenda.</p>';
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

    const items = [
      ...todayTasks.map((t) => ({ type: 'menage', task: t, label: t['Nom'] || '' })),
      ...dueMedicaments.map((m) => ({ type: 'medicament', task: m, label: ChatTab.formatMedicamentLabel(m) }))
    ];

    if (items.length === 0) {
      el.innerHTML = '<p class="text-muted">Rien à faire aujourd\'hui 🎉</p>';
      return;
    }

    el.innerHTML = '';
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'task-chips';
    items.forEach((item) => chipsWrap.appendChild(renderDashboardTaskChip(item)));
    el.appendChild(chipsWrap);
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="text-muted">Impossible de charger les tâches.</p>';
  }
}

function renderDashboardTaskChip(item) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `task-chip accent-${item.type === 'medicament' ? 'chat' : 'menage'}`;
  chip.innerHTML = `
    <span class="task-chip-check" aria-hidden="true"></span>
    <span class="task-chip-body">
      <span class="task-chip-name">${escapeHtml(item.label)}</span>
    </span>
  `;
  chip.addEventListener('click', () => onDashboardTaskDone(chip, item));
  return chip;
}

async function onDashboardTaskDone(chip, item) {
  if (chip.classList.contains('task-chip--busy')) return;
  chip.classList.add('task-chip--busy', 'task-chip--done');
  Confetti.burst();

  try {
    if (item.type === 'menage') {
      const updated = { ...item.task, ...TaskReset.markDoneFields() };
      await SheetsAPI.updateRow(CONFIG.SHEETS.MENAGE_TACHES, item.task._rowIndex, updated);
    } else {
      await ChatTab.markMedicamentDone(item.task);
    }

    setTimeout(() => {
      chip.classList.add('task-chip--exit');
      setTimeout(() => {
        const wrap = chip.closest('.task-chips');
        chip.remove();
        if (wrap && wrap.querySelectorAll('.task-chip').length === 0) {
          wrap.parentElement.innerHTML = '<p class="text-muted">Rien à faire aujourd\'hui 🎉</p>';
        }
      }, 300);
    }, 500);
  } catch (err) {
    console.error(err);
    chip.classList.remove('task-chip--busy', 'task-chip--done');
    alert("Impossible d'enregistrer cette tâche, réessaie.");
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
    // updateViaCache: 'none' — sans ça, service-worker.js lui-même hérite du
    // Cache-Control: max-age=600 de GitHub Pages, et le navigateur peut
    // mettre jusqu'à 10 min à remarquer qu'une nouvelle version existe.
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).catch((err) => {
      console.error('Échec enregistrement du service worker :', err);
    });
  }
}
