// Onglet Enfant > Bibliothèque (Enfant_Bibliotheque : ID, Titre, Date_emprunt,
// Date_retour, Statut). Écran dédié, séparé de l'onglet Enfant principal (déjà
// volumineux) — coché "Rendu" via le pattern task-chip habituel (Courses,
// Ménage). Expose getBooksByUrgency/formatBookLabel/markBookReturned pour que
// app.js les intègre directement dans "Tâches du jour"/"Tâches de la
// semaine", comme ChatTab le fait déjà pour les médicaments (voir chat.js).

const EnfantBibliothequeTab = (() => {
  const SHEET = CONFIG.SHEETS.ENFANT_BIBLIOTHEQUE;

  function isEmprunte(row) {
    return (row['Statut'] || '').trim().toLowerCase() === 'emprunté';
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-enfant">
        <h2>Bibliothèque</h2>
      </section>
      <section id="bibliotheque-list" class="task-list">
        <p class="text-muted">Chargement…</p>
      </section>
      <form id="bibliotheque-add-form" class="quick-add-form">
        <input type="text" id="bibliotheque-add-titre" placeholder="Titre" required />
        <label class="field-label" for="bibliotheque-add-emprunt">Date d'emprunt</label>
        <input type="date" id="bibliotheque-add-emprunt" required />
        <label class="field-label" for="bibliotheque-add-retour">Date de retour</label>
        <input type="date" id="bibliotheque-add-retour" required />
        <button type="submit" class="btn">Ajouter</button>
      </form>
    `;

    container.querySelector('#bibliotheque-add-form').addEventListener('submit', (e) => onAdd(e, container));
    await renderList(container);
  }

  async function renderList(container) {
    const listEl = container.querySelector('#bibliotheque-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const emprunts = rows
        .filter(isEmprunte)
        .sort((a, b) => (a['Date_retour'] || '').localeCompare(b['Date_retour'] || ''));

      if (emprunts.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun emprunt en cours 🎉</p>';
        return;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      emprunts.forEach((r) => chipsWrap.appendChild(renderChip(r, container)));
      listEl.appendChild(chipsWrap);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les emprunts.</p>';
    }
  }

  function renderChip(r, container) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-enfant';
    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('enfant')}</span>${escapeHtml(r['Titre'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(formatMeta(r))}</span>
      </span>
    `;
    chip.addEventListener('click', () => onCheck(chip, r, container));
    return chip;
  }

  function formatMeta(r) {
    const parts = [];
    if (r['Date_emprunt']) parts.push(`emprunté le ${formatDate(r['Date_emprunt'])}`);
    if (r['Date_retour']) parts.push(`retour le ${formatDate(r['Date_retour'])}`);
    return parts.join(' · ');
  }

  async function onCheck(chip, r, container) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      await markBookReturned(r);
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => renderList(container), 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer ce retour, réessaie.");
    }
  }

  async function onAdd(e, container) {
    e.preventDefault();
    const titreInput = container.querySelector('#bibliotheque-add-titre');
    const empruntInput = container.querySelector('#bibliotheque-add-emprunt');
    const retourInput = container.querySelector('#bibliotheque-add-retour');

    const titre = titreInput.value.trim();
    if (!titre || !empruntInput.value || !retourInput.value) return;

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
        'Titre': titre,
        'Date_emprunt': empruntInput.value,
        'Date_retour': retourInput.value,
        'Statut': 'Emprunté'
      });

      titreInput.value = '';
      empruntInput.value = '';
      retourInput.value = '';

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cet emprunt, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Utilisé par le dashboard (app.js) ----------

  // Emprunts en cours répartis entre "à rendre aujourd'hui ou en retard"
  // (Tâches du jour) et "à rendre dans les 7 prochains jours, mais pas
  // aujourd'hui" (Tâches de la semaine) — un seul fetch pour les deux.
  async function getBooksByUrgency(now = new Date()) {
    const todayIso = DateUtils.toISODate(now);
    const in7DaysIso = DateUtils.toISODate(new Date(now.getTime() + 7 * 86400000));

    const { rows } = await SheetsAPI.getRows(SHEET);
    const emprunts = rows.filter(isEmprunte);

    const due = emprunts.filter((r) => (r['Date_retour'] || '') <= todayIso);
    const upcoming = emprunts.filter((r) => {
      const retour = r['Date_retour'] || '';
      return retour > todayIso && retour <= in7DaysIso;
    });

    return { due, upcoming };
  }

  function formatBookLabel(r) {
    return [r['Titre'], r['Date_retour'] ? `retour ${formatDate(r['Date_retour'])}` : null].filter(Boolean).join(' — ');
  }

  async function markBookReturned(r) {
    await SheetsAPI.updateRow(SHEET, r._rowIndex, { ...r, 'Statut': 'Rendu' });
  }

  // ---------- Utilitaires ----------

  function formatDate(value) {
    const d = DateUtils.parseDate(value);
    if (!d) return value || '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  TabRegistry.register('enfant-bibliotheque', { title: 'Bibliothèque', accent: 'enfant', render });

  return { getBooksByUrgency, formatBookLabel, markBookReturned };
})();
