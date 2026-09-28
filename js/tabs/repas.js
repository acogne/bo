// Onglet Repas : planning des repas (ID, Jour, Repas, Plat, Ingrédients_clés,
// Prévu_par, Semaine, URL_recette). La colonne Semaine (numéro de semaine ISO, même
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
        <input type="url" id="repas-add-url" placeholder="Lien de la recette (optionnel)" />
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

  function renderJourGroups(container, repasRows, rootContainer) {
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
        row.className = 'info-row info-row--with-actions';
        const metaParts = [];
        if (r['Ingrédients_clés']) metaParts.push(r['Ingrédients_clés']);
        if (r['Prévu_par']) metaParts.push(`prévu par ${r['Prévu_par']}`);
        row.innerHTML = `
          <div class="info-row-main info-row-main--clickable">
            <div class="info-row-title">${escapeHtml(r['Repas'] || '')} — ${platHtml(r)}</div>
            <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
          </div>
          <button type="button" class="info-row-delete" aria-label="Supprimer ce repas">${Icons.svg('supprimer')}</button>
        `;
        // Le titre peut contenir un lien vers la recette (platHtml) : ignorer
        // le clic quand il vise ce lien, pour qu'il ouvre la recette au lieu
        // de basculer la ligne en édition.
        row.querySelector('.info-row-main').addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          onEditRepas(row, r, rootContainer);
        });
        row.querySelector('.info-row-delete').addEventListener('click', () => onDeleteRepas(r, rootContainer));
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
        renderJourGroups(section, bucketRows, container);
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

  // Supprime dans Courses toutes les lignes générées pour ce repas
  // (Origine_Repas_ID correspondant), qu'un nouvel ingrédient soit recréé
  // ensuite ou non.
  async function deleteCoursesForRepas(repasId) {
    const { rows } = await SheetsAPI.getRows(CONFIG.SHEETS.COURSES);
    const matching = rows.filter((r) => String(r['Origine_Repas_ID'] || '').trim() === String(repasId));
    if (matching.length > 0) {
      await SheetsAPI.deleteRows(CONFIG.SHEETS.COURSES, matching.map((r) => r._rowIndex));
    }
  }

  // Recrée la liste Courses générée pour ce repas à partir d'Ingrédients_clés
  // (une ligne Courses par ingrédient, virgule = séparateur). Repart toujours
  // de zéro (supprime l'ancienne génération) pour rester cohérent si la liste
  // d'ingrédients a changé entre deux enregistrements du repas.
  async function syncCoursesFromRepas(repasId, ingredientsText) {
    await deleteCoursesForRepas(repasId);

    const ingredients = ingredientsText.split(',').map((s) => s.trim()).filter(Boolean);
    if (ingredients.length === 0) return;

    const { rows } = await SheetsAPI.getRows(CONFIG.SHEETS.COURSES);
    let nextId = rows.reduce((max, r) => {
      const id = parseInt(r['ID'], 10);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);

    for (const article of ingredients) {
      nextId += 1;
      await SheetsAPI.appendRow(CONFIG.SHEETS.COURSES, {
        'ID': nextId,
        'Article': article,
        'Quantité': '',
        'Unité': '',
        'Catégorie': 'Autre',
        'Ajouté_par': 'Auto (menu)',
        'Acheté': 'Non',
        'Origine_Repas_ID': String(repasId)
      });
    }
  }

  function onEditRepas(row, r, container) {
    if (row.classList.contains('info-row--editing')) return;
    row.classList.add('info-row--editing');

    const jourVal = (r['Jour'] || '').trim();
    const repasVal = (r['Repas'] || '').trim();

    row.innerHTML = `
      <form class="quick-add-form info-row-edit-form">
        <select class="info-row-edit-jour">
          ${JOUR_ORDER.map((j) => `<option value="${j}"${j === jourVal ? ' selected' : ''}>${j}</option>`).join('')}
        </select>
        <select class="info-row-edit-repas">
          ${REPAS_ORDER.map((m) => `<option value="${m}"${m === repasVal ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="text" class="info-row-edit-plat" placeholder="Plat" value="${escapeAttr(r['Plat'] || '')}" required />
        <input type="text" class="info-row-edit-ingredients" placeholder="Ingrédients clés (optionnel)" value="${escapeAttr(r['Ingrédients_clés'] || '')}" />
        <input type="url" class="info-row-edit-url" placeholder="Lien de la recette (optionnel)" value="${escapeAttr(r['URL_recette'] || '')}" />
        <input type="text" class="info-row-edit-prevupar" placeholder="Prévu par" value="${escapeAttr(r['Prévu_par'] || '')}" />
        <div class="task-chip-edit-actions">
          <button type="submit" class="btn">Enregistrer</button>
          <button type="button" class="btn btn-secondary info-row-edit-cancel">Annuler</button>
        </div>
      </form>
    `;

    row.querySelector('.info-row-edit-cancel').addEventListener('click', () => renderList(container));
    row.querySelector('.info-row-edit-form').addEventListener('submit', (e) => onSaveEditRepas(e, r, container));
  }

  // Enregistre les modifications d'un repas déjà planifié (jour, moment,
  // plat, ingrédients…). La Semaine n'est volontairement pas modifiable ici
  // (seul le formulaire d'ajout gère "cette semaine" / "semaine +1") ; un
  // conflit avec un autre repas déjà planifié sur le créneau visé bloque
  // l'enregistrement plutôt que de l'écraser silencieusement.
  async function onSaveEditRepas(e, r, container) {
    e.preventDefault();
    const form = e.target;
    const jour = form.querySelector('.info-row-edit-jour').value;
    const repasMoment = form.querySelector('.info-row-edit-repas').value;
    const plat = form.querySelector('.info-row-edit-plat').value.trim();
    if (!plat) return;
    const ingredientsValue = form.querySelector('.info-row-edit-ingredients').value.trim();
    const url = form.querySelector('.info-row-edit-url').value.trim();
    const prevuPar = form.querySelector('.info-row-edit-prevupar').value.trim();

    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const semaine = r['Semaine'] || '';
      const conflict = rows.find(
        (other) =>
          other._rowIndex !== r._rowIndex &&
          (other['Jour'] || '').trim() === jour &&
          (other['Repas'] || '').trim() === repasMoment &&
          (other['Semaine'] || '') === semaine
      );
      if (conflict) {
        alert('Un repas est déjà planifié sur ce jour et ce moment — choisis un autre créneau.');
        saveBtn.disabled = false;
        return;
      }

      await SheetsAPI.updateRow(SHEET, r._rowIndex, {
        ...r,
        'Jour': jour,
        'Repas': repasMoment,
        'Plat': plat,
        'Ingrédients_clés': ingredientsValue,
        'Prévu_par': prevuPar,
        'URL_recette': url
      });

      if (ingredientsValue) {
        await syncCoursesFromRepas(r['ID'], ingredientsValue);
      }

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer ce repas, réessaie.");
      saveBtn.disabled = false;
    }
  }

  async function onDeleteRepas(r, container) {
    const label = [r['Repas'], r['Plat']].filter(Boolean).join(' — ');
    if (!confirm(`Supprimer "${label || 'ce repas'}" ?`)) return;

    try {
      await SheetsAPI.deleteRows(SHEET, [r._rowIndex]);
      await deleteCoursesForRepas(r['ID']);
      await renderList(container);
    } catch (err) {
      console.error(err);
      alert('Impossible de supprimer ce repas, réessaie.');
    }
  }

  async function onSubmit(e, container) {
    e.preventDefault();
    const semaineSelect = container.querySelector('#repas-add-semaine');
    const jourSelect = container.querySelector('#repas-add-jour');
    const repasSelect = container.querySelector('#repas-add-repas');
    const platInput = container.querySelector('#repas-add-plat');
    const ingredientsInput = container.querySelector('#repas-add-ingredients');
    const urlInput = container.querySelector('#repas-add-url');
    const prevuParInput = container.querySelector('#repas-add-prevupar');

    const plat = platInput.value.trim();
    if (!plat) return;

    const offset = parseInt(semaineSelect.value, 10) || 0;
    const currentWeek = DateUtils.isoWeekNumber(new Date());
    const targetWeek = currentWeek + offset;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const ingredientsValue = ingredientsInput.value.trim();

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const existing = rows.find(
        (r) =>
          (r['Jour'] || '').trim() === jourSelect.value &&
          (r['Repas'] || '').trim() === repasSelect.value &&
          rowMatchesWeek(r, currentWeek, offset)
      );

      let repasId;
      if (existing) {
        repasId = existing['ID'];
        await SheetsAPI.updateRow(SHEET, existing._rowIndex, {
          ...existing,
          'Plat': plat,
          'Ingrédients_clés': ingredientsValue,
          'Prévu_par': prevuParInput.value.trim(),
          'Semaine': String(targetWeek),
          'URL_recette': urlInput.value.trim()
        });
      } else {
        const maxId = rows.reduce((max, r) => {
          const id = parseInt(r['ID'], 10);
          return isNaN(id) ? max : Math.max(max, id);
        }, 0);
        repasId = maxId + 1;

        await SheetsAPI.appendRow(SHEET, {
          'ID': repasId,
          'Jour': jourSelect.value,
          'Repas': repasSelect.value,
          'Plat': plat,
          'Ingrédients_clés': ingredientsValue,
          'Prévu_par': prevuParInput.value.trim(),
          'Semaine': String(targetWeek),
          'URL_recette': urlInput.value.trim()
        });
      }

      if (ingredientsValue) {
        await syncCoursesFromRepas(repasId, ingredientsValue);
      }

      platInput.value = '';
      ingredientsInput.value = '';
      urlInput.value = '';

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer ce repas, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // Rend le plat cliquable (ouvre la recette dans un nouvel onglet) quand une
  // URL est renseignée ; sinon reste du texte simple comme avant cette
  // fonctionnalité. N'accepte que http(s) pour éviter d'insérer un href
  // javascript: à partir d'une valeur saisie par l'utilisateur.
  function platHtml(r) {
    const plat = escapeHtml(r['Plat'] || '');
    const url = (r['URL_recette'] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return plat;
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${plat}</a>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Utilisé pour les valeurs insérées dans un attribut (href) — escapeHtml
  // seul ne protège pas les guillemets hors contexte texte.
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  TabRegistry.register('repas', { title: 'Repas', accent: '', render });
})();
