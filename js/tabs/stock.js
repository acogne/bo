// Onglet Stock : suivi manuel des réserves (ID, Article, Seuil_alerte,
// Statut, Dernière_maj) — pas de quantité live, Statut est positionné à la
// main ('OK' / 'Bas' / 'Épuisé'). Le formulaire d'ajout fait un upsert par
// nom d'article (insensible à la casse) : soumettre un article déjà connu
// met juste à jour son statut au lieu de créer une ligne en double — c'est
// aussi comme ça qu'on signale "ça devient bas", en le resoumettant.

(function registerStockTab() {
  const SHEET = CONFIG.SHEETS.STOCK;

  function isPending(article) {
    const statut = (article['Statut'] || '').trim().toLowerCase();
    return statut !== '' && statut !== 'ok';
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-stock">
        <h2>Stock</h2>
      </section>

      <section class="card">
        <h3>À racheter</h3>
        <div id="stock-pending-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <section class="card">
        <h3>Tout le stock</h3>
        <div id="stock-all-list"><p class="text-muted">Chargement…</p></div>
      </section>

      <form id="stock-add-form" class="quick-add-form">
        <input type="text" id="stock-add-article" placeholder="Article (ex. Papier toilette)" required />
        <select id="stock-add-statut">
          <option value="OK">OK</option>
          <option value="Bas">Bas</option>
          <option value="Épuisé">Épuisé</option>
        </select>
        <input type="text" id="stock-add-seuil" placeholder="Seuil d'alerte (ex. 2 paquets, optionnel)" />
        <input type="date" id="stock-add-peremption" placeholder="Date de péremption (optionnel)" />
        <button type="submit" class="btn">Enregistrer</button>
      </form>
    `;

    container.querySelector('#stock-add-form').addEventListener('submit', (e) => onSubmit(e, container));

    await Promise.all([renderPending(container), renderAll(container)]);
  }

  async function renderPending(container) {
    const listEl = container.querySelector('#stock-pending-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const pending = rows.filter(isPending).sort((a, b) => (a['Article'] || '').localeCompare(b['Article'] || ''));

      if (pending.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Rien à racheter pour le moment 🎉</p>';
        return;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      pending.forEach((a) => chipsWrap.appendChild(renderChip(a, container)));
      listEl.appendChild(chipsWrap);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger le stock.</p>';
    }
  }

  function renderChip(article, container) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-stock';
    chip.dataset.rowIndex = article._rowIndex;

    const metaParts = [article['Statut'] || ''];
    if (article['Seuil_alerte']) metaParts.push(`seuil : ${article['Seuil_alerte']}`);
    if (article['Péremption']) metaParts.push(`périme le ${formatDate(article['Péremption'])}`);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('stock')}</span>${escapeHtml(article['Article'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onRestock(chip, article, container));
    return chip;
  }

  async function onRestock(chip, article, container) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      await SheetsAPI.updateRow(SHEET, article._rowIndex, { ...article, 'Statut': 'OK', 'Dernière_maj': DateUtils.toISODate() });
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(async () => {
          await Promise.all([renderPending(container), renderAll(container)]);
        }, 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer, réessaie.");
    }
  }

  async function renderAll(container) {
    const listEl = container.querySelector('#stock-all-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun article enregistré.</p>';
        return;
      }

      const sorted = [...rows].sort((a, b) => (a['Article'] || '').localeCompare(b['Article'] || ''));

      listEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      sorted.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        const metaParts = [a['Statut'] || 'OK'];
        if (a['Seuil_alerte']) metaParts.push(`seuil : ${a['Seuil_alerte']}`);
        if (a['Péremption']) metaParts.push(`périme le ${formatDate(a['Péremption'])}`);
        if (a['Dernière_maj']) metaParts.push(`maj le ${formatDate(a['Dernière_maj'])}`);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(a['Article'] || '')}</div>
          <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });
      listEl.appendChild(wrap);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger le stock.</p>';
    }
  }

  async function onSubmit(e, container) {
    e.preventDefault();
    const articleInput = container.querySelector('#stock-add-article');
    const statutSelect = container.querySelector('#stock-add-statut');
    const seuilInput = container.querySelector('#stock-add-seuil');
    const peremptionInput = container.querySelector('#stock-add-peremption');

    const article = articleInput.value.trim();
    if (!article) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const existing = rows.find((r) => (r['Article'] || '').trim().toLowerCase() === article.toLowerCase());

      if (existing) {
        await SheetsAPI.updateRow(SHEET, existing._rowIndex, {
          ...existing,
          'Statut': statutSelect.value,
          'Seuil_alerte': seuilInput.value.trim() || existing['Seuil_alerte'],
          'Péremption': peremptionInput.value || existing['Péremption'],
          'Dernière_maj': DateUtils.toISODate()
        });
      } else {
        const maxId = rows.reduce((max, r) => {
          const id = parseInt(r['ID'], 10);
          return isNaN(id) ? max : Math.max(max, id);
        }, 0);

        await SheetsAPI.appendRow(SHEET, {
          'ID': maxId + 1,
          'Article': article,
          'Seuil_alerte': seuilInput.value.trim(),
          'Péremption': peremptionInput.value,
          'Statut': statutSelect.value,
          'Dernière_maj': DateUtils.toISODate()
        });
      }

      articleInput.value = '';
      statutSelect.value = 'OK';
      seuilInput.value = '';
      peremptionInput.value = '';

      await Promise.all([renderPending(container), renderAll(container)]);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer cet article, réessaie.");
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

  TabRegistry.register('stock', { title: 'Stock', accent: '', render });
})();
