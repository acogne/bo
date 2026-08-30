// Onglet Compteurs : pas de champ Statut/Fréquence dans le Sheet (Compteurs
// est un simple journal de relevés : ID, Date, Type, Relevé_par, Notes). Le
// rappel "à faire" est donc calculé, pas stocké : chaque cycle démarre le 27
// du mois, et un type de compteur reste "à faire" tant qu'aucun relevé de ce
// type n'a été enregistré depuis le 27 courant. Cocher un rappel = ajouter un
// relevé du jour, ce qui le fait disparaître jusqu'au 27 suivant.
//
// Exposé aussi via `CompteursTab.renderDashboardCard` pour que la homepage
// (app.js) puisse afficher les mêmes rappels sans dupliquer la logique.

const CompteursTab = (() => {
  const SHEET = CONFIG.SHEETS.COMPTEURS;
  const METER_TYPES = ['Eau', 'Électricité'];

  function cycleStart(now = new Date()) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    if (d.getDate() < 27) d.setMonth(d.getMonth() - 1);
    d.setDate(27);
    return d;
  }

  async function getPendingTypes(now = new Date()) {
    const { rows } = await SheetsAPI.getRows(SHEET);
    const start = cycleStart(now);
    const doneTypes = new Set(
      rows
        .filter((r) => {
          const d = DateUtils.parseDate(r['Date']);
          return d && d >= start;
        })
        .map((r) => (r['Type'] || '').trim())
    );
    return METER_TYPES.filter((t) => !doneTypes.has(t));
  }

  async function markDone(type) {
    const { rows } = await SheetsAPI.getRows(SHEET);
    const maxId = rows.reduce((max, r) => {
      const id = parseInt(r['ID'], 10);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);
    const user = Auth.getUser();

    await SheetsAPI.appendRow(SHEET, {
      'ID': maxId + 1,
      'Date': DateUtils.toISODate(),
      'Type': type,
      'Relevé_par': user ? (user.name || user.email) : '',
      'Notes': ''
    });
  }

  // Rend les chips "à faire" dans listEl ; appelle onEmpty() si plus rien à
  // relever (utilisé par la home pour masquer toute la carte).
  async function renderPending(listEl, onEmpty) {
    try {
      const pending = await getPendingTypes();

      if (pending.length === 0) {
        if (onEmpty) onEmpty();
        else listEl.innerHTML = '<p class="text-muted">Compteurs à jour ce mois-ci 🎉</p>';
        return pending;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      pending.forEach((type) => chipsWrap.appendChild(renderChip(type, listEl, onEmpty)));
      listEl.appendChild(chipsWrap);
      return pending;
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les compteurs.</p>';
      return [];
    }
  }

  function renderChip(type, listEl, onEmpty) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip';
    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name">Relever le compteur ${escapeHtml(type)}</span>
        <span class="task-chip-meta">À faire ce mois-ci</span>
      </span>
    `;
    chip.addEventListener('click', () => onCheck(chip, type, listEl, onEmpty));
    return chip;
  }

  async function onCheck(chip, type, listEl, onEmpty) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');

    try {
      await markDone(type);
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => renderPending(listEl, onEmpty), 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer ce relevé, réessaie.");
    }
  }

  // ---------- Historique ----------

  async function renderHistorique(listEl) {
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun relevé enregistré.</p>';
        return;
      }

      const recent = [...rows]
        .sort((a, b) => (b['Date'] || '').localeCompare(a['Date'] || ''))
        .slice(0, 10);

      listEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      recent.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        const metaParts = [formatDate(r['Date'])];
        if (r['Relevé_par']) metaParts.push(r['Relevé_par']);
        if (r['Notes']) metaParts.push(r['Notes']);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(r['Type'] || '')}</div>
          <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });
      listEl.appendChild(wrap);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger l\'historique.</p>';
    }
  }

  async function onAddRelevé(e, container) {
    e.preventDefault();
    const typeSelect = container.querySelector('#compteurs-add-type');
    const dateInput = container.querySelector('#compteurs-add-date');
    const notesInput = container.querySelector('#compteurs-add-notes');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const maxId = rows.reduce((max, r) => {
        const id = parseInt(r['ID'], 10);
        return isNaN(id) ? max : Math.max(max, id);
      }, 0);
      const user = Auth.getUser();

      await SheetsAPI.appendRow(SHEET, {
        'ID': maxId + 1,
        'Date': dateInput.value || DateUtils.toISODate(),
        'Type': typeSelect.value,
        'Relevé_par': user ? (user.name || user.email) : '',
        'Notes': notesInput.value.trim()
      });

      dateInput.value = '';
      notesInput.value = '';

      const pendingListEl = container.querySelector('#compteurs-pending-list');
      const historiqueListEl = container.querySelector('#compteurs-historique-list');
      await Promise.all([renderPending(pendingListEl), renderHistorique(historiqueListEl)]);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter ce relevé, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Onglet dédié ----------

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header">
        <h2>Compteurs</h2>
        <p class="week-info">Relevé eau/électricité attendu chaque mois à partir du 27.</p>
      </section>

      <section class="card">
        <h3>À relever ce mois-ci</h3>
        <div id="compteurs-pending-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <section class="card">
        <h3>Historique</h3>
        <div id="compteurs-historique-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <form id="compteurs-add-form" class="quick-add-form">
        <select id="compteurs-add-type">
          <option value="Eau">Eau</option>
          <option value="Électricité">Électricité</option>
          <option value="Autre">Autre</option>
        </select>
        <input type="date" id="compteurs-add-date" placeholder="Date (par défaut aujourd'hui)" />
        <input type="text" id="compteurs-add-notes" placeholder="Notes (ex. valeur relevée)" />
        <button type="submit" class="btn">Ajouter un relevé</button>
      </form>
    `;

    container.querySelector('#compteurs-add-form').addEventListener('submit', (e) => onAddRelevé(e, container));

    await Promise.all([
      renderPending(container.querySelector('#compteurs-pending-list')),
      renderHistorique(container.querySelector('#compteurs-historique-list'))
    ]);
  }

  // ---------- Carte homepage ----------

  async function renderDashboardCard(cardEl, listEl) {
    const pending = await renderPending(listEl, () => {
      cardEl.hidden = true;
    });
    cardEl.hidden = pending.length === 0;
  }

  // ---------- Utilitaires ----------

  function formatDate(value) {
    const d = DateUtils.parseDate(value);
    if (!d) return value || '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  TabRegistry.register('compteurs', { title: 'Compteurs', accent: '', render });

  return { renderDashboardCard };
})();
