// Onglet Budget : dépenses du foyer (ID, Date, Libellé, Montant, Catégorie,
// Payé_par, Remboursement_dû, Périodicité). Remboursement_dû est traité comme
// un montant encore dû (chaîne numérique) : tant qu'il est > 0, la dépense
// apparaît dans "Remboursements en attente" ; cocher la remet à 0 (réglé),
// sans y toucher pour les dépenses qui n'ont jamais eu de remboursement à faire.
//
// Périodicité (Aucune/Mensuel/Annuel) sert aux montants fixes saisis une
// seule fois (ex. loyer) : comme la remise à zéro des tâches Ménage, RIEN
// n'est jamais réécrit dans le Sheet — le total "Ce mois-ci" recalcule à
// l'affichage si la ligne d'origine doit compter pour le mois courant.

(function registerBudgetTab() {
  const SHEET = CONFIG.SHEETS.BUDGET;

  function parseAmount(value) {
    const n = parseFloat(String(value || '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function formatAmount(value) {
    return `${parseAmount(value).toFixed(2)} CHF`;
  }

  function isPending(entry) {
    return parseAmount(entry['Remboursement_dû']) > 0;
  }

  // Une dépense à périodicité Mensuel/Annuel compte pour le mois courant même
  // si sa Date d'origine est un mois différent — sauf le mois d'origine
  // lui-même, déjà compté via la comparaison de date classique (pas de doublon).
  function isRecurringThisMonth(entry, now) {
    const periodicite = (entry['Périodicité'] || '').trim().toLowerCase();
    if (periodicite !== 'mensuel' && periodicite !== 'annuel') return false;

    const origin = DateUtils.parseDate(entry['Date']);
    if (!origin) return false;

    const sameMonth = origin.getFullYear() === now.getFullYear() && origin.getMonth() === now.getMonth();
    if (sameMonth) return false;

    if (periodicite === 'mensuel') {
      return origin < new Date(now.getFullYear(), now.getMonth(), 1);
    }
    // Annuel : ne compte que le mois anniversaire, les années suivantes.
    return origin.getMonth() === now.getMonth() && origin.getFullYear() < now.getFullYear();
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-budget">
        <h2>Budget</h2>
        <p class="week-info" id="budget-resume">Chargement…</p>
      </section>

      <section class="card">
        <h3>Remboursements en attente</h3>
        <div id="budget-pending-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <section class="card">
        <h3>Dépenses récentes</h3>
        <div id="budget-historique-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <form id="budget-add-form" class="quick-add-form">
        <input type="text" id="budget-add-libelle" placeholder="Libellé (ex. Courses, Essence)" required />
        <input type="text" id="budget-add-montant" placeholder="Montant (ex. 45.90)" required inputmode="decimal" />
        <input type="text" id="budget-add-categorie" placeholder="Catégorie (ex. Alimentation)" />
        <input type="date" id="budget-add-date" />
        <select id="budget-add-periodicite">
          <option value="">Ponctuel (pas de récurrence)</option>
          <option value="Mensuel">Tous les mois (ex. loyer)</option>
          <option value="Annuel">Tous les ans</option>
        </select>
        <input type="text" id="budget-add-payepar" placeholder="Payé par" />
        <input type="text" id="budget-add-remboursement" placeholder="Montant à rembourser (optionnel)" inputmode="decimal" />
        <button type="submit" class="btn">Ajouter une dépense</button>
      </form>
    `;

    const payeParInput = container.querySelector('#budget-add-payepar');
    const user = Auth.getUser();
    if (user) payeParInput.value = user.name || user.email;

    container.querySelector('#budget-add-form').addEventListener('submit', (e) => onAddDepense(e, container));

    await Promise.all([
      renderResume(container),
      renderPending(container.querySelector('#budget-pending-list')),
      renderHistorique(container.querySelector('#budget-historique-list'))
    ]);
  }

  async function renderResume(container) {
    const el = container.querySelector('#budget-resume');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const now = new Date();
      const total = rows
        .filter((r) => {
          const d = DateUtils.parseDate(r['Date']);
          const sameMonth = d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
          return sameMonth || isRecurringThisMonth(r, now);
        })
        .reduce((sum, r) => sum + parseAmount(r['Montant']), 0);

      el.innerHTML = `Ce mois-ci : <strong>${formatAmount(total)}</strong> de dépenses`;
    } catch (err) {
      console.error(err);
      el.textContent = 'Impossible de charger le résumé.';
    }
  }

  async function renderPending(listEl) {
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const pending = rows.filter(isPending).sort((a, b) => (a['Date'] || '').localeCompare(b['Date'] || ''));

      if (pending.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun remboursement en attente 🎉</p>';
        return;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      pending.forEach((entry) => chipsWrap.appendChild(renderPendingChip(entry, listEl)));
      listEl.appendChild(chipsWrap);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les remboursements.</p>';
    }
  }

  function renderPendingChip(entry, listEl) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-budget';
    chip.dataset.rowIndex = entry._rowIndex;

    const metaParts = [formatAmount(entry['Remboursement_dû']) + ' dû'];
    if (entry['Payé_par']) metaParts.push(`payé par ${entry['Payé_par']}`);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('budget')}</span>${escapeHtml(entry['Libellé'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onSettle(chip, entry, listEl));
    return chip;
  }

  async function onSettle(chip, entry, listEl) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      await SheetsAPI.updateRow(SHEET, entry._rowIndex, { ...entry, 'Remboursement_dû': '0' });
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => renderPending(listEl), 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer, réessaie.");
    }
  }

  async function renderHistorique(listEl) {
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucune dépense enregistrée.</p>';
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
        row.className = 'info-row accent-budget';
        const metaParts = [formatDate(r['Date']), formatAmount(r['Montant'])];
        if (r['Catégorie']) metaParts.push(r['Catégorie']);
        if (r['Payé_par']) metaParts.push(`payé par ${r['Payé_par']}`);
        if (r['Périodicité']) metaParts.push(`🔁 ${r['Périodicité']}`);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(r['Libellé'] || '')}</div>
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

  async function onAddDepense(e, container) {
    e.preventDefault();
    const libelleInput = container.querySelector('#budget-add-libelle');
    const montantInput = container.querySelector('#budget-add-montant');
    const categorieInput = container.querySelector('#budget-add-categorie');
    const dateInput = container.querySelector('#budget-add-date');
    const periodiciteSelect = container.querySelector('#budget-add-periodicite');
    const payeParInput = container.querySelector('#budget-add-payepar');
    const remboursementInput = container.querySelector('#budget-add-remboursement');

    const libelle = libelleInput.value.trim();
    const montant = montantInput.value.trim();
    if (!libelle || !montant) return;

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
        'Date': dateInput.value || DateUtils.toISODate(),
        'Libellé': libelle,
        'Montant': montant,
        'Catégorie': categorieInput.value.trim(),
        'Payé_par': payeParInput.value.trim(),
        'Remboursement_dû': remboursementInput.value.trim(),
        'Périodicité': periodiciteSelect.value
      });

      libelleInput.value = '';
      montantInput.value = '';
      categorieInput.value = '';
      dateInput.value = '';
      periodiciteSelect.value = '';
      remboursementInput.value = '';

      await Promise.all([
        renderResume(container),
        renderPending(container.querySelector('#budget-pending-list')),
        renderHistorique(container.querySelector('#budget-historique-list'))
      ]);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette dépense, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

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

  TabRegistry.register('budget', { title: 'Budget', accent: 'budget', render });
})();
