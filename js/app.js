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

  injectMenuIcons();
  document.getElementById('courses-shortcut-btn').innerHTML = Icons.svg('courses');
  initFieldBlurOnOutsideTap();

  window.addEventListener('hashchange', renderRoute);

  registerServiceWorker();
});

// Sur mobile, taper dans un champ zoome légèrement l'écran (comportement
// natif iOS). En tapant en dehors de tout champ, on force la perte de focus
// (ce qui referme le clavier) puis on force Safari à recalculer le zoom de
// la page — sans quoi, en PWA/standalone, la page peut rester zoomée même
// une fois le clavier fermé. Passer directement d'un champ à un autre ne
// doit rien déclencher ici : le navigateur gère déjà cette transition tout
// seul, sans à-coup de zoom.
function initFieldBlurOnOutsideTap() {
  document.addEventListener('pointerdown', (event) => {
    const active = document.activeElement;
    if (!active || !active.matches('input, textarea, select')) return;
    if (active.contains(event.target)) return;
    if (event.target.closest && event.target.closest('input, textarea, select')) return;
    active.blur();
    resetIOSZoom();
  });
}

function resetIOSZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  const original = viewport.getAttribute('content');
  viewport.setAttribute('content', `${original}, maximum-scale=1`);
  setTimeout(() => viewport.setAttribute('content', original), 100);
}

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

function injectMenuIcons() {
  document.querySelectorAll('#menu-overlay a.menu-link[href^="#/"]').forEach((link) => {
    const route = link.getAttribute('href').replace(/^#\//, '');
    const iconKey = route === 'dashboard' ? 'accueil' : route;
    const svg = Icons.svg(iconKey);
    if (!svg) return;
    link.innerHTML = `<span class="menu-icon">${svg}</span><span>${link.textContent}</span>`;
  });
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
    <p id="dash-quote" class="dash-quote" hidden></p>
    <section class="card dash-card">
      <h3>Cette semaine</h3>
      <p id="dash-week-info" class="text-muted">Chargement…</p>
      <div id="dash-week-events"><p class="text-muted">Chargement des événements…</p></div>
      <button type="button" id="dash-add-event-toggle" class="btn btn-secondary">+ Ajouter un événement</button>
      <form id="dash-add-event-form" class="quick-add-form" hidden>
        <input type="text" id="dash-event-titre" placeholder="Titre" required />
        <input type="date" id="dash-event-date" required />
        <input type="time" id="dash-event-heure" required />
        <input type="text" id="dash-event-lieu" placeholder="Lieu (optionnel)" />
        <button type="submit" class="btn">Ajouter au calendrier</button>
      </form>
    </section>
    <section class="card dash-card">
      <h3>Prochains week-ends</h3>
      <div id="dash-weekends"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card">
      <h3>Tâches du jour</h3>
      <div id="dash-today-tasks"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card">
      <h3>Tâches de la semaine</h3>
      <div id="dash-week-tasks"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card" id="dash-compteurs-card" hidden>
      <h3>Compteurs à relever</h3>
      <div id="dash-compteurs-list"><p class="text-muted">Chargement…</p></div>
    </section>
    <section class="card dash-card" id="dash-vehicule-card" hidden>
      <h3>Entretien véhicule</h3>
      <div id="dash-vehicule-list"><p class="text-muted">Chargement…</p></div>
    </section>
  `;

  initDashAddEventForm();

  renderDashboardQuote();
  renderDashboardWeekInfo();
  renderDashboardWeekEvents();
  renderDashboardWeekends();
  renderDashboardTodayTasks();
  renderDashboardCompteurs();
  renderDashboardVehicule();
}

// Citation du jour : sélection déterministe sur le jour de l'année (et non
// aléatoire) pour que les deux téléphones du foyer affichent la même
// citation sans synchronisation entre eux, stable jusqu'à minuit.
async function renderDashboardQuote() {
  const el = document.getElementById('dash-quote');
  try {
    const { rows } = await SheetsAPI.getRows(CONFIG.SHEETS.CITATIONS);
    if (rows.length === 0) return;

    const sorted = [...rows].sort((a, b) => (parseInt(a['ID'], 10) || 0) - (parseInt(b['ID'], 10) || 0));

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
    const quote = sorted[(dayOfYear - 1) % sorted.length];

    el.textContent = `« ${quote['Texte'] || ''} »`;
    el.hidden = false;
  } catch (err) {
    console.error(err);
  }
}

// L'écran natif "Ajouter l'événement" d'iOS, ouvert depuis un lien .ics,
// n'autorise à modifier que le calendrier de destination (titre/heure/lieu
// affichés en lecture seule). On récupère donc titre/date/heure/lieu ici,
// dans un mini-formulaire, et on les injecte directement dans le .ics
// généré — il ne reste plus qu'à choisir le calendrier côté iOS.
function initDashAddEventForm() {
  const toggleBtn = document.getElementById('dash-add-event-toggle');
  const form = document.getElementById('dash-add-event-form');
  const dateInput = document.getElementById('dash-event-date');
  const heureInput = document.getElementById('dash-event-heure');

  const pad = (n) => String(n).padStart(2, '0');
  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  defaultStart.setHours(defaultStart.getHours() + 1);
  dateInput.value = `${defaultStart.getFullYear()}-${pad(defaultStart.getMonth() + 1)}-${pad(defaultStart.getDate())}`;
  heureInput.value = `${pad(defaultStart.getHours())}:${pad(defaultStart.getMinutes())}`;

  toggleBtn.addEventListener('click', () => {
    form.hidden = !form.hidden;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const titre = document.getElementById('dash-event-titre').value.trim();
    const lieu = document.getElementById('dash-event-lieu').value.trim();
    const [year, month, day] = dateInput.value.split('-').map(Number);
    const [hours, minutes] = heureInput.value.split(':').map(Number);
    const start = new Date(year, month - 1, day, hours, minutes);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    window.location.href = buildAddEventIcsUrl({ titre, lieu, start, end });
  });
}

function buildAddEventIcsUrl({ titre, lieu, start, end }) {
  const pad = (n) => String(n).padStart(2, '0');

  const escapeIcsText = (str) =>
    str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');

  const formatLocal = (date) =>
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;

  const formatUtc = (date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dashboard Foyer//FR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@dashboard-foyer`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatLocal(start)}`,
    `DTEND:${formatLocal(end)}`,
    `SUMMARY:${escapeIcsText(titre)}`,
    lieu ? `LOCATION:${escapeIcsText(lieu)}` : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
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

function formatEventParts(event) {
  const start = event.start || {};
  const date = parseCalendarDate(start);
  const dayAbbrev = date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  const dayNum = date.getDate();
  const timeLabel = start.dateTime
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : 'Toute la journée';
  return { dayAbbrev, dayNum, timeLabel };
}

function buildEventRow(ev) {
  const { dayAbbrev, dayNum, timeLabel } = formatEventParts(ev);
  const row = document.createElement('div');
  row.className = 'event-row';
  row.innerHTML = `
    <span class="event-badge">
      <span class="event-badge-day">${escapeHtml(dayAbbrev)}</span>
      <span class="event-badge-num">${dayNum}</span>
    </span>
    <span class="event-row-body">
      <span class="event-row-title">${escapeHtml(ev.summary || '(Sans titre)')}</span>
      <span class="event-row-time">${escapeHtml(timeLabel)}</span>
    </span>
  `;
  return row;
}

async function renderDashboardWeekEvents() {
  const el = document.getElementById('dash-week-events');
  try {
    const events = await CalendarAPI.listUpcomingEvents({ days: 7 });

    if (events.length === 0) {
      el.innerHTML = '<p class="text-muted">Aucun événement dans les 7 prochains jours.</p>';
      return;
    }

    el.innerHTML = '<div class="event-rows"></div>';
    const wrap = el.querySelector('.event-rows');
    events.forEach((ev) => wrap.appendChild(buildEventRow(ev)));
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="text-muted">Impossible de charger les événements de l\'agenda.</p>';
  }
}

// Regroupe les 4 prochains week-ends (samedi-dimanche) — celui en cours
// compte comme le premier si on est déjà samedi ou dimanche.
function getNextWeekends(now, count) {
  const monday = DateUtils.startOfWeekMonday(now);
  const saturday = new Date(monday);
  saturday.setDate(saturday.getDate() + 5);

  const sundayEnd = new Date(saturday);
  sundayEnd.setDate(sundayEnd.getDate() + 1);
  sundayEnd.setHours(23, 59, 59, 999);
  if (sundayEnd < now) {
    saturday.setDate(saturday.getDate() + 7);
  }

  const weekends = [];
  for (let i = 0; i < count; i++) {
    const sat = new Date(saturday);
    sat.setDate(sat.getDate() + i * 7);
    const sun = new Date(sat);
    sun.setDate(sun.getDate() + 1);
    weekends.push({ saturday: sat, sunday: sun });
  }
  return weekends;
}

function formatWeekendLabel(weekend) {
  const satLabel = weekend.saturday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const sunLabel = weekend.sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${satLabel} - ${sunLabel}`;
}

async function renderDashboardWeekends() {
  const el = document.getElementById('dash-weekends');
  try {
    const now = new Date();
    const weekends = getNextWeekends(now, 4);
    const lastSunday = weekends[weekends.length - 1].sunday;
    const daysNeeded = Math.ceil((lastSunday - now) / 86400000) + 1;

    const events = await CalendarAPI.listUpcomingEvents({ days: daysNeeded, maxResults: 100 });

    el.innerHTML = '';
    weekends.forEach((weekend) => {
      const weekendEvents = events.filter((ev) => {
        const date = parseCalendarDate(ev.start || {});
        return DateUtils.isSameDay(date, weekend.saturday) || DateUtils.isSameDay(date, weekend.sunday);
      });

      const group = document.createElement('div');
      group.className = 'weekend-group';
      group.innerHTML = `<h4 class="weekend-group-title">${escapeHtml(formatWeekendLabel(weekend))}</h4>`;

      if (weekendEvents.length === 0) {
        group.innerHTML += '<p class="text-muted">Rien de prévu.</p>';
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'event-rows';
        weekendEvents.forEach((ev) => wrap.appendChild(buildEventRow(ev)));
        group.appendChild(wrap);
      }

      el.appendChild(group);
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="text-muted">Impossible de charger les événements des week-ends.</p>';
  }
}

async function renderDashboardTodayTasks() {
  const dailyEl = document.getElementById('dash-today-tasks');
  const weeklyEl = document.getElementById('dash-week-tasks');
  try {
    const now = new Date();
    const [menageRes, dueMedicaments] = await Promise.all([
      SheetsAPI.getRows(CONFIG.SHEETS.MENAGE_TACHES),
      ChatTab.getDueMedicaments(now)
    ]);

    const visibleTasks = menageRes.rows.filter((t) => TaskReset.isVisible(t, now));
    const dailyTasks = visibleTasks.filter((t) => (t['Fréquence'] || '').trim().toLowerCase() === 'quotidien');
    const weeklyTasks = visibleTasks.filter((t) => (t['Fréquence'] || '').trim().toLowerCase() === 'hebdo');

    const dailyItems = [
      ...dailyTasks.map((t) => ({ type: 'menage', task: t, label: t['Nom'] || '' })),
      ...dueMedicaments.map((m) => ({ type: 'medicament', task: m, label: ChatTab.formatMedicamentLabel(m) }))
    ];
    const weeklyItems = weeklyTasks.map((t) => ({ type: 'menage', task: t, label: t['Nom'] || '' }));

    renderDashboardTaskList(dailyEl, dailyItems, "Rien à faire aujourd'hui 🎉");
    renderDashboardTaskList(weeklyEl, weeklyItems, 'Rien à faire cette semaine 🎉');
  } catch (err) {
    console.error(err);
    dailyEl.innerHTML = '<p class="text-muted">Impossible de charger les tâches.</p>';
    weeklyEl.innerHTML = '<p class="text-muted">Impossible de charger les tâches.</p>';
  }
}

function renderDashboardTaskList(el, items, emptyText) {
  if (items.length === 0) {
    el.innerHTML = `<p class="text-muted">${emptyText}</p>`;
    return;
  }

  el.innerHTML = '';
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'task-chips';
  items.forEach((item) => chipsWrap.appendChild(renderDashboardTaskChip(item, emptyText)));
  el.appendChild(chipsWrap);
}

function renderDashboardTaskChip(item, emptyText) {
  const domain = item.type === 'medicament' ? 'chat' : 'menage';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `task-chip accent-${domain}`;
  chip.innerHTML = `
    <span class="task-chip-check" aria-hidden="true"></span>
    <span class="task-chip-body">
      <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg(domain)}</span>${escapeHtml(item.label)}</span>
    </span>
  `;
  chip.addEventListener('click', () => onDashboardTaskDone(chip, item, emptyText));
  return chip;
}

async function onDashboardTaskDone(chip, item, emptyText) {
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
          wrap.parentElement.innerHTML = `<p class="text-muted">${emptyText}</p>`;
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
