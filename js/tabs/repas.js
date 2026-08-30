// Onglet Repas : planning des repas (ID, Jour, Repas, Plat, Ingrédients_clés,
// Prévu_par). Pas de colonne Semaine/Date — c'est un planning courant que le
// foyer remplit/remplace au fil de l'eau, pas une rotation automatique.
// Comme Stock, le formulaire fait un upsert par créneau (Jour + Repas) : replanifier
// le déjeuner de lundi met juste à jour l'entrée existante au lieu d'en créer
// une en double.

(function registerRepasTab() {
  const SHEET = CONFIG.SHEETS.REPAS;

  const JOUR_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const REPAS_ORDER = ['Petit-déjeuner', 'Midi', 'Soir'];

  function orderIndex(order, value) {
    const i = order.indexOf((value || '').trim());
    return i === -1 ? order.length : i;
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

  async function renderList(container) {
    const listEl = container.querySelector('#repas-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun repas planifié.</p>';
        return;
      }

      const byJour = new Map();
      rows.forEach((r) => {
        const jour = r['Jour'] || 'Autre';
        if (!byJour.has(jour)) byJour.set(jour, []);
        byJour.get(jour).push(r);
      });

      const jours = [...byJour.keys()].sort((a, b) => orderIndex(JOUR_ORDER, a) - orderIndex(JOUR_ORDER, b));

      listEl.innerHTML = '';
      jours.forEach((jour) => {
        const repas = byJour.get(jour).sort((a, b) => orderIndex(REPAS_ORDER, a['Repas']) - orderIndex(REPAS_ORDER, b['Repas']));

        const group = document.createElement('div');
        group.className = 'task-group';
        group.innerHTML = `<h3 class="task-group-title">${escapeHtml(jour)}</h3>`;

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
        listEl.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger le planning.</p>';
    }
  }

  async function onSubmit(e, container) {
    e.preventDefault();
    const jourSelect = container.querySelector('#repas-add-jour');
    const repasSelect = container.querySelector('#repas-add-repas');
    const platInput = container.querySelector('#repas-add-plat');
    const ingredientsInput = container.querySelector('#repas-add-ingredients');
    const prevuParInput = container.querySelector('#repas-add-prevupar');

    const plat = platInput.value.trim();
    if (!plat) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const existing = rows.find(
        (r) => (r['Jour'] || '').trim() === jourSelect.value && (r['Repas'] || '').trim() === repasSelect.value
      );

      if (existing) {
        await SheetsAPI.updateRow(SHEET, existing._rowIndex, {
          ...existing,
          'Plat': plat,
          'Ingrédients_clés': ingredientsInput.value.trim(),
          'Prévu_par': prevuParInput.value.trim()
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
          'Prévu_par': prevuParInput.value.trim()
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
