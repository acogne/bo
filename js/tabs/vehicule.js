// Onglet Véhicule : journal d'entretien (ID, Véhicule, Type_entretien,
// Dernière_date, Prochaine_échéance, Kilométrage). Comme Compteurs, les
// rappels (pneus été/hiver + e-vignette) ne sont pas des lignes à part dans
// le Sheet : ils sont calculés à partir de la date du jour. Les pneus
// restent mutuellement exclusifs : un seul des deux peut être actif à la
// fois, l'année étant coupée en deux moitiés par les dates d'équinoxe
// (20 mars / 22 septembre, approximation à un jour près pour Genève — inutile
// de calculer l'équinoxe astronomique exact pour un rappel pneus) — de mars à
// septembre c'est "Pneus été" qui peut être en attente, de septembre à mars
// suivant c'est "Pneus hiver". L'autre n'apparaît jamais pendant ce temps,
// même si sa propre saison passée n'avait pas été cochée. La e-vignette est
// indépendante de ce cycle (15 janvier, jusqu'à cochée) et peut donc être en
// attente en même temps qu'un rappel pneus.
//
// Exposé via `VehiculeTab.renderDashboardCard` pour la home, même pattern que
// CompteursTab.

const VehiculeTab = (() => {
  const SHEET = CONFIG.SHEETS.VEHICULE;

  const SPRING = { type: 'Pneus été', month: 2, day: 20 };   // ~20 mars, arrivée du printemps à Genève
  const AUTUMN = { type: 'Pneus hiver', month: 8, day: 22 }; // ~22 septembre, arrivée de l'automne à Genève
  const VIGNETTE = { type: 'E-vignette', month: 0, day: 15 }; // 15 janvier, indépendant du cycle pneus été/hiver

  // Le seul rappel pertinent pour "now" : celui de la moitié d'année en
  // cours, avec la date de départ de cette fenêtre (pour savoir si un
  // entretien plus récent l'a déjà satisfait).
  function currentSeasonalReminder(now = new Date()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const springThisYear = new Date(year, SPRING.month, SPRING.day);
    const autumnThisYear = new Date(year, AUTUMN.month, AUTUMN.day);

    if (today >= springThisYear && today < autumnThisYear) {
      return { ...SPRING, cycleStart: springThisYear };
    }
    if (today >= autumnThisYear) {
      return { ...AUTUMN, cycleStart: autumnThisYear };
    }
    // today < springThisYear : encore dans l'hiver entamé l'automne précédent.
    return { ...AUTUMN, cycleStart: new Date(year - 1, AUTUMN.month, AUTUMN.day) };
  }

  // La e-vignette n'apparaît qu'à partir du 15 janvier de l'année en cours
  // (pas de report de l'année précédente si elle n'a pas été cochée — même
  // logique "fenêtre, pas de report" que les pneus) et reste en attente
  // toute l'année tant qu'elle n'est pas cochée.
  function currentVignetteReminder(now = new Date()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const thresholdThisYear = new Date(today.getFullYear(), VIGNETTE.month, VIGNETTE.day);
    if (today < thresholdThisYear) return null;
    return { ...VIGNETTE, cycleStart: thresholdThisYear };
  }

  // Contrairement aux pneus (un seul actif à la fois), la e-vignette est
  // indépendante et peut être en attente en même temps qu'un rappel pneus.
  async function getPendingReminders(now = new Date()) {
    const candidates = [currentSeasonalReminder(now), currentVignetteReminder(now)].filter(Boolean);
    const { rows } = await SheetsAPI.getRows(SHEET);

    return candidates.filter((reminder) => {
      const done = rows.some((r) => {
        const d = DateUtils.parseDate(r['Dernière_date']);
        return d && d >= reminder.cycleStart && (r['Type_entretien'] || '').trim().toLowerCase() === reminder.type.toLowerCase();
      });
      return !done;
    });
  }

  async function markDone(reminder, now = new Date()) {
    const { rows } = await SheetsAPI.getRows(SHEET);
    const maxId = rows.reduce((max, r) => {
      const id = parseInt(r['ID'], 10);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);

    const nextDue = new Date(reminder.cycleStart.getFullYear() + 1, reminder.month, reminder.day);

    await SheetsAPI.appendRow(SHEET, {
      'ID': maxId + 1,
      'Véhicule': '',
      'Type_entretien': reminder.type,
      'Dernière_date': DateUtils.toISODate(now),
      'Prochaine_échéance': DateUtils.toISODate(nextDue),
      'Kilométrage': ''
    });
  }

  // Rend les chips "à faire" dans listEl ; renvoie la liste des rappels
  // encore en attente (utilisé par la home pour masquer la carte si vide).
  // cardEl est optionnel (fourni seulement depuis la home) : quand il est
  // là, cette fonction se charge elle-même de le montrer/cacher — y compris
  // lors du re-rendu après avoir coché un chip directement depuis la home,
  // pas seulement au premier chargement via renderDashboardCard.
  async function renderPending(listEl, now = new Date(), cardEl = null) {
    try {
      const pending = await getPendingReminders(now);

      if (pending.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Entretiens saisonniers à jour 🎉</p>';
        if (cardEl) cardEl.hidden = true;
        return pending;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      pending.forEach((reminder) => chipsWrap.appendChild(renderChip(reminder, listEl, cardEl)));
      listEl.appendChild(chipsWrap);
      if (cardEl) cardEl.hidden = false;
      return pending;
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les entretiens.</p>';
      return [];
    }
  }

  function renderChip(reminder, listEl, cardEl) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-vehicule';
    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('vehicule')}</span>${escapeHtml(reminder.type)}</span>
        <span class="task-chip-meta">Rappel annuel</span>
      </span>
    `;
    chip.addEventListener('click', () => onCheck(chip, reminder, listEl, cardEl));
    return chip;
  }

  async function onCheck(chip, reminder, listEl, cardEl) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      await markDone(reminder);
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => renderPending(listEl, new Date(), cardEl), 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer cet entretien, réessaie.");
    }
  }

  // ---------- Historique ----------

  async function renderHistorique(listEl) {
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun entretien enregistré.</p>';
        return;
      }

      const recent = [...rows]
        .sort((a, b) => (b['Dernière_date'] || '').localeCompare(a['Dernière_date'] || ''))
        .slice(0, 10);

      listEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      recent.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        const metaParts = [formatDate(r['Dernière_date'])];
        if (r['Véhicule']) metaParts.push(r['Véhicule']);
        if (r['Prochaine_échéance']) metaParts.push(`Prochaine échéance : ${formatDate(r['Prochaine_échéance'])}`);
        if (r['Kilométrage']) metaParts.push(`${r['Kilométrage']} km`);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(r['Type_entretien'] || '')}</div>
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

  async function onAddEntretien(e, container) {
    e.preventDefault();
    const vehiculeInput = container.querySelector('#vehicule-add-vehicule');
    const typeInput = container.querySelector('#vehicule-add-type');
    const dateInput = container.querySelector('#vehicule-add-date');
    const echeanceInput = container.querySelector('#vehicule-add-echeance');
    const kmInput = container.querySelector('#vehicule-add-km');

    const type = typeInput.value.trim();
    if (!type) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const maxId = rows.reduce((max, r) => {
        const id = parseInt(r['ID'], 10);
        return isNaN(id) ? max : Math.max(max, id);
      }, 0);

      await SheetsAPI.appendRow(SHEET, {
        'ID': maxId + 1,
        'Véhicule': vehiculeInput.value.trim(),
        'Type_entretien': type,
        'Dernière_date': dateInput.value || DateUtils.toISODate(),
        'Prochaine_échéance': echeanceInput.value,
        'Kilométrage': kmInput.value.trim()
      });

      vehiculeInput.value = '';
      typeInput.value = '';
      dateInput.value = '';
      echeanceInput.value = '';
      kmInput.value = '';

      const pendingListEl = container.querySelector('#vehicule-pending-list');
      const historiqueListEl = container.querySelector('#vehicule-historique-list');
      await Promise.all([renderPending(pendingListEl), renderHistorique(historiqueListEl)]);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cet entretien, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Onglet dédié ----------

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-vehicule">
        <h2>Véhicule</h2>
        <p class="week-info">Pneus été rappelés au printemps (~20 mars), pneus hiver à l'automne (~22 septembre), e-vignette dès le 15 janvier.</p>
      </section>

      <section class="card">
        <h3>Entretiens saisonniers</h3>
        <div id="vehicule-pending-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <section class="card">
        <h3>Historique</h3>
        <div id="vehicule-historique-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <form id="vehicule-add-form" class="quick-add-form">
        <input type="text" id="vehicule-add-vehicule" placeholder="Véhicule (ex. Clio, Voiture principale)" />
        <input type="text" id="vehicule-add-type" placeholder="Type d'entretien (ex. Vidange, Contrôle technique)" required />
        <input type="date" id="vehicule-add-date" placeholder="Date (par défaut aujourd'hui)" />
        <input type="date" id="vehicule-add-echeance" placeholder="Prochaine échéance (optionnel)" />
        <input type="text" id="vehicule-add-km" placeholder="Kilométrage (optionnel)" />
        <button type="submit" class="btn">Ajouter un entretien</button>
      </form>
    `;

    container.querySelector('#vehicule-add-form').addEventListener('submit', (e) => onAddEntretien(e, container));

    await Promise.all([
      renderPending(container.querySelector('#vehicule-pending-list')),
      renderHistorique(container.querySelector('#vehicule-historique-list'))
    ]);
  }

  // ---------- Carte homepage ----------

  async function renderDashboardCard(cardEl, listEl) {
    return renderPending(listEl, new Date(), cardEl);
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

  TabRegistry.register('vehicule', { title: 'Véhicule', accent: '', render });

  return { renderDashboardCard };
})();
