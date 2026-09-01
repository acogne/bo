// Onglet Courses : liste des articles à acheter (Courses), fusionnée avec les
// achats pour le chat (Chat_Achats — schéma différent : ID/Article/Statut/Notes,
// pas de Quantité/Unité/Catégorie/Ajouté_par). Les deux sheets sont mergés en
// une seule liste groupée par catégorie (les articles chat apparaissent sous
// "Chat"), pour que "où en est-on des courses" reste une vue unique. Toute
// lecture/écriture passe par SheetsAPI — aucun appel direct à l'API Google ici.

(function registerCoursesTab() {
  const SHEET = CONFIG.SHEETS.COURSES;
  const SHEET_CHAT = CONFIG.SHEETS.CHAT_ACHATS;

  // Chaque entrée de la liste fusionnée est { raw, sheet } : `raw` est la ligne
  // brute telle que lue depuis son sheet d'origine (avec _rowIndex), `sheet`
  // vaut 'courses' ou 'chat' et pilote quel champ représente "acheté" et quel
  // sheet cibler pour la mise à jour.

  function getArticle(entry) {
    return entry.raw['Article'] || '';
  }

  function getCategorie(entry) {
    return entry.sheet === 'chat' ? 'Chat' : (entry.raw['Catégorie'] || 'Autre');
  }

  function isDone(entry) {
    return entry.sheet === 'chat'
      ? (entry.raw['Statut'] || '').trim().toLowerCase() === 'acheté'
      : (entry.raw['Acheté'] || '').trim().toLowerCase() === 'oui';
  }

  function getMetaParts(entry) {
    if (entry.sheet === 'chat') {
      const parts = [];
      if (entry.raw['Notes']) parts.push(entry.raw['Notes']);
      return parts;
    }
    const parts = [];
    const qty = [entry.raw['Quantité'], entry.raw['Unité']].filter(Boolean).join(' ');
    if (qty) parts.push(qty);
    if (entry.raw['Ajouté_par']) parts.push(`ajouté par ${entry.raw['Ajouté_par']}`);
    return parts;
  }

  async function markDone(entry) {
    if (entry.sheet === 'chat') {
      await SheetsAPI.updateRow(SHEET_CHAT, entry.raw._rowIndex, { ...entry.raw, 'Statut': 'Acheté' });
    } else {
      await SheetsAPI.updateRow(SHEET, entry.raw._rowIndex, { ...entry.raw, 'Acheté': 'Oui' });
    }
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-courses">
        <h2>Courses</h2>
      </section>
      <section id="courses-list" class="task-list">
        <p class="text-muted">Chargement des articles…</p>
      </section>
      <form id="courses-add-form" class="quick-add-form">
        <input type="text" id="courses-add-article" placeholder="Article" required />
        <input type="text" id="courses-add-quantite" placeholder="Quantité (ex. 2)" />
        <input type="text" id="courses-add-unite" placeholder="Unité (ex. kg, L, pièce)" />
        <input type="text" id="courses-add-categorie" placeholder="Catégorie (ex. Frais)" />
        <button type="submit" class="btn">Ajouter</button>
      </form>
    `;

    container.querySelector('#courses-add-form').addEventListener('submit', (e) => onAddItem(e, container));

    await renderList(container);
  }

  async function renderList(container) {
    const listEl = container.querySelector('#courses-list');
    try {
      const [coursesRes, chatRes] = await Promise.all([
        SheetsAPI.getRows(SHEET),
        SheetsAPI.getRows(SHEET_CHAT)
      ]);

      const coursesPendingCount = coursesRes.rows.filter((r) => (r['Acheté'] || '').trim().toLowerCase() !== 'oui').length;
      setCoursesBadgeCount(coursesPendingCount);

      const entries = [
        ...coursesRes.rows.map((raw) => ({ raw, sheet: 'courses' })),
        ...chatRes.rows.map((raw) => ({ raw, sheet: 'chat' }))
      ];
      const todo = entries.filter((e) => !isDone(e));

      if (todo.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Liste de courses vide 🎉</p>';
        return;
      }

      const byCategorie = new Map();
      todo.forEach((entry) => {
        const cat = getCategorie(entry);
        if (!byCategorie.has(cat)) byCategorie.set(cat, []);
        byCategorie.get(cat).push(entry);
      });

      listEl.innerHTML = '';
      byCategorie.forEach((items, categorie) => {
        const group = document.createElement('div');
        group.className = 'task-group';
        group.innerHTML = `<h3 class="task-group-title">${escapeHtml(categorie)}</h3>`;

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'task-chips';
        items.forEach((entry) => chipsWrap.appendChild(renderChip(entry, container)));

        group.appendChild(chipsWrap);
        listEl.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger la liste de courses.</p>';
    }
  }

  function renderChip(entry, container) {
    const chip = document.createElement('div');
    chip.className = `task-chip ${entry.sheet === 'chat' ? 'accent-chat' : 'accent-courses'}`;
    chip.dataset.rowIndex = entry.raw._rowIndex;

    const metaParts = getMetaParts(entry);

    chip.innerHTML = `
      <button type="button" class="task-chip-check" aria-label="Marquer comme acheté"></button>
      <button type="button" class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg(entry.sheet === 'chat' ? 'chat' : 'courses')}</span>${escapeHtml(getArticle(entry))}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </button>
    `;

    chip.querySelector('.task-chip-check').addEventListener('click', () => onCheckItem(chip, entry));
    chip.querySelector('.task-chip-body').addEventListener('click', () => onEditItem(chip, entry, container));
    return chip;
  }

  async function onCheckItem(chip, entry) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      await markDone(entry);
      if (entry.sheet === 'courses') refreshCoursesBadge();

      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => {
          const group = chip.closest('.task-group');
          chip.remove();
          if (group && group.querySelectorAll('.task-chip').length === 0) {
            group.remove();
          }
        }, 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer cet article, réessaie.");
    }
  }

  function onEditItem(chip, entry, container) {
    if (chip.classList.contains('task-chip--editing')) return;
    chip.classList.add('task-chip--editing');

    const isChat = entry.sheet === 'chat';

    chip.innerHTML = `
      <form class="task-chip-edit-form">
        <input type="text" class="task-chip-edit-article" placeholder="Article" value="${escapeAttr(getArticle(entry))}" required />
        ${isChat ? `
          <input type="text" class="task-chip-edit-notes" placeholder="Notes" value="${escapeAttr(entry.raw['Notes'] || '')}" />
        ` : `
          <input type="text" class="task-chip-edit-quantite" placeholder="Quantité" value="${escapeAttr(entry.raw['Quantité'] || '')}" />
          <input type="text" class="task-chip-edit-unite" placeholder="Unité" value="${escapeAttr(entry.raw['Unité'] || '')}" />
          <input type="text" class="task-chip-edit-categorie" placeholder="Catégorie" value="${escapeAttr(entry.raw['Catégorie'] || '')}" />
        `}
        <div class="task-chip-edit-actions">
          <button type="submit" class="btn">Enregistrer</button>
          <button type="button" class="btn btn-secondary task-chip-edit-cancel">Annuler</button>
        </div>
      </form>
    `;

    const form = chip.querySelector('.task-chip-edit-form');
    form.querySelector('.task-chip-edit-cancel').addEventListener('click', () => renderList(container));
    form.addEventListener('submit', (e) => onSaveEdit(e, entry, container, isChat));
  }

  async function onSaveEdit(e, entry, container, isChat) {
    e.preventDefault();
    const form = e.target;
    const article = form.querySelector('.task-chip-edit-article').value.trim();
    if (!article) return;

    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;

    try {
      if (isChat) {
        const notes = form.querySelector('.task-chip-edit-notes').value.trim();
        await SheetsAPI.updateRow(SHEET_CHAT, entry.raw._rowIndex, { ...entry.raw, 'Article': article, 'Notes': notes });
      } else {
        const quantite = form.querySelector('.task-chip-edit-quantite').value.trim();
        const unite = form.querySelector('.task-chip-edit-unite').value.trim();
        const categorie = form.querySelector('.task-chip-edit-categorie').value.trim();
        await SheetsAPI.updateRow(SHEET, entry.raw._rowIndex, {
          ...entry.raw,
          'Article': article,
          'Quantité': quantite,
          'Unité': unite,
          'Catégorie': categorie
        });
      }
      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer les modifications, réessaie.");
      saveBtn.disabled = false;
    }
  }

  async function onAddItem(e, container) {
    e.preventDefault();
    const articleInput = container.querySelector('#courses-add-article');
    const quantiteInput = container.querySelector('#courses-add-quantite');
    const uniteInput = container.querySelector('#courses-add-unite');
    const categorieInput = container.querySelector('#courses-add-categorie');

    const article = articleInput.value.trim();
    if (!article) return;

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
        'Article': article,
        'Quantité': quantiteInput.value.trim(),
        'Unité': uniteInput.value.trim(),
        'Catégorie': categorieInput.value.trim(),
        'Ajouté_par': user ? (user.name || user.email) : '',
        'Acheté': 'Non'
      });

      articleInput.value = '';
      quantiteInput.value = '';
      uniteInput.value = '';
      categorieInput.value = '';

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cet article, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  TabRegistry.register('courses', { title: 'Courses', accent: 'courses', render });
})();
