// Onglet Repas : planning des repas (ID, Jour, Repas, Plat, Ingrédients_clés,
// Prévu_par, Semaine). La colonne Semaine (numéro de semaine ISO, même
// convention que Ménage_rotation) distingue "cette semaine" de "semaine +1" :
// sans elle, remplir le planning de la semaine prochaine un samedi écrasait le
// menu du samedi en cours, puisque le seul identifiant d'un créneau était
// Jour + Repas. Une ligne sans Semaine (donnée d'avant cette colonne) est
// traitée comme "cette semaine" par défaut.
// Comme Stock, le formulaire fait un upsert par créneau (Jour + Repas + Semaine) :
// replanifier le déjeuner de lundi met juste à jour l'entrée existante au lieu
// d'en créer une en double.

(function registerRepasTab() {
  const SHEET = CONFIG.SHEETS.REPAS;

  const JOUR_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const REPAS_ORDER = ['Petit-déjeuner', 'Midi', 'Soir'];
  const WEEK_BUCKETS = [
    { offset: 0, label: 'Cette semaine' },
    { offset: 1, label: 'Semaine +1' }
  ];

  function orderIndex(order, value) {
    const i = order.indexOf((value || '').trim());
    return i === -1 ? order.length : i;
  }

  // true si `row` appartient à la semaine `currentWeek + offset`. Offset 0
  // (semaine courante) accepte aussi les lignes sans Semaine renseignée.
  function rowMatchesWeek(row, currentWeek, offset) {
    const weekNum = DateUtils.parseWeekNumber(row['Semaine']);
    if (weekNum === null) return offset === 0;
    return weekNum === currentWeek + offset;
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header">
        <h2>Repas</h2>
      </section>
      <section id="repas-list" class="task-list">
        <p class="text-muted">Chargement du planning…</p>
      </section>
      <form id="repas-add-form" class="quick-add-form">
        <select id="repas-add-semaine">
          ${WEEK_BUCKETS.map((w) => `<option value="${w.offset}">${w.label}</option>`).join('')}
        </select>
        <select id="repas-add-jour">
          ${JOUR_ORDER.map((j) => `<option value="${j}">${j}</option>`).join('')}
        </select>
        <select id="repas-add-repas">
          <option value="Midi">Midi</option>
          <option value="Soir">Soir</option>
          <option value="Petit-déjeuner">Petit-déjeuner</option>
        </select>
        <input type="text" id="repas-add-plat" placeholder="Plat (ex. Gratin de légumes)" required />
        <input type="text" id="repas-add-ingredients" placeholder="Ingrédients clés (optionnel)" />
        <input type="text" id="repas-add-prevupar" placeholder="Prévu par" />
        <button type="submit" class="btn">Enregistrer</button>
      </form>
    `;

    const prevuParInput = container.querySelector('#repas-add-prevupar');
    const user = Auth.getUser();
    if (user) prevuParInput.value = user.name || user.email;

    container.querySelector('#repas-add-form').addEventListener('submit', (e) => onSubmit(e, container));

    await renderList(container);
  }

  function renderJourGroups(container, repasRows) {
    const byJour = new Map();
    repasRows.forEach((r) => {
      const jour = r['Jour'] || 'Autre';
      if (!byJour.has(jour)) byJour.set(jour, []);
      byJour.get(jour).push(r);
    });

    const jours = [...byJour.keys()].sort((a, b) => orderIndex(JOUR_ORDER, a) - orderIndex(JOUR_ORDER, b));

    jours.forEach((jour) => {
      const repas = byJour.get(jour).sort((a, b) => orderIndex(REPAS_ORDER, a['Repas']) - orderIndex(REPAS_ORDER, b['Repas']));

      const group = document.createElement('div');
      group.className = 'task-group';
      group.innerHTML = `<h4 class="task-group-title">${escapeHtml(jour)}</h4>`;

      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      repas.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        const metaParts = [];
        if (r['Ingrédients_clés']) metaParts.push(r['Ingrédients_clés']);
        if (r['Prévu_par']) metaParts.push(`prévu par ${r['Prévu_par']}`);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(r['Repas'] || '')} — ${escapeHtml(r['Plat'] || '')}</div>
          <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });

      group.appendChild(wrap);
      container.appendChild(group);
    });
  }

  async function renderList(container) {
    const listEl = container.querySelector('#repas-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun repas planifié.</p>';
        return;
      }

      const currentWeek = DateUtils.isoWeekNumber(new Date());
      listEl.innerHTML = '';

      WEEK_BUCKETS.forEach(({ offset, label }) => {
        const bucketRows = rows.filter((r) => rowMatchesWeek(r, currentWeek, offset));
        if (bucketRows.length === 0) return;

        const section = document.createElement('div');
        section.className = 'task-week-section';
        section.innerHTML = `<h3 class="task-week-title">${escapeHtml(label)}</h3>`;
        renderJourGroups(section, bucketRows);
        listEl.appendChild(section);
      });

      if (!listEl.children.length) {
        listEl.innerHTML = '<p class="text-muted">Aucun repas planifié pour cette semaine ou la suivante.</p>';
      }
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger le planning.</p>';
    }
  }

  async function onSubmit(e, container) {
    e.preventDefault();
    const semaineSelect = container.querySelector('#repas-add-semaine');
    const jourSelect = container.querySelector('#repas-add-jour');
    const repasSelect = container.querySelector('#repas-add-repas');
    const platInput = container.querySelector('#repas-add-plat');
    const ingredientsInput = container.querySelector('#repas-add-ingredients');
    const prevuParInput = container.querySelector('#repas-add-prevupar');

    const plat = platInput.value.trim();
    if (!plat) return;

    const offset = parseInt(semaineSelect.value, 10) || 0;
    const currentWeek = DateUtils.isoWeekNumber(new Date());
    const targetWeek = currentWeek + offset;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const existing = rows.find(
        (r) =>
          (r['Jour'] || '').trim() === jourSelect.value &&
          (r['Repas'] || '').trim() === repasSelect.value &&
          rowMatchesWeek(r, currentWeek, offset)
      );

      if (existing) {
        await SheetsAPI.updateRow(SHEET, existing._rowIndex, {
          ...existing,
          'Plat': plat,
          'Ingrédients_clés': ingredientsInput.value.trim(),
          'Prévu_par': prevuParInput.value.trim(),
          'Semaine': String(targetWeek)
        });
      } else {
        const maxId = rows.reduce((max, r) => {
          const id = parseInt(r['ID'], 10);
          return isNaN(id) ? max : Math.max(max, id);
        }, 0);

        await SheetsAPI.appendRow(SHEET, {
          'ID': maxId + 1,
          'Jour': jourSelect.value,
          'Repas': repasSelect.value,
          'Plat': plat,
          'Ingrédients_clés': ingredientsInput.value.trim(),
          'Prévu_par': prevuParInput.value.trim(),
          'Semaine': String(targetWeek)
        });
      }

      platInput.value = '';
      ingredientsInput.value = '';

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer ce repas, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  TabRegistry.register('repas', { title: 'Repas', accent: '', render });
})();
