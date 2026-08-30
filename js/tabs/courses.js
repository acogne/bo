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
        <label class="checkbox-label">
          <input type="checkbox" id="courses-add-chat" /> Pour le chat
        </label>
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
        items.forEach((entry) => chipsWrap.appendChild(renderChip(entry)));

        group.appendChild(chipsWrap);
        listEl.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger la liste de courses.</p>';
    }
  }

  function renderChip(entry) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `task-chip ${entry.sheet === 'chat' ? 'accent-chat' : 'accent-courses'}`;
    chip.dataset.rowIndex = entry.raw._rowIndex;

    const metaParts = getMetaParts(entry);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name">${escapeHtml(getArticle(entry))}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onCheckItem(chip, entry));
    return chip;
  }

  async function onCheckItem(chip, entry) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');

    try {
      await markDone(entry);

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

  async function onAddItem(e, container) {
    e.preventDefault();
    const articleInput = container.querySelector('#courses-add-article');
    const quantiteInput = container.querySelector('#courses-add-quantite');
    const uniteInput = container.querySelector('#courses-add-unite');
    const categorieInput = container.querySelector('#courses-add-categorie');
    const chatInput = container.querySelector('#courses-add-chat');

    const article = articleInput.value.trim();
    if (!article) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      if (chatInput.checked) {
        const { rows } = await SheetsAPI.getRows(SHEET_CHAT);
        const maxId = rows.reduce((max, r) => {
          const id = parseInt(r['ID'], 10);
          return isNaN(id) ? max : Math.max(max, id);
        }, 0);

        await SheetsAPI.appendRow(SHEET_CHAT, {
          'ID': maxId + 1,
          'Article': article,
          'Statut': 'À acheter',
          'Notes': ''
        });
      } else {
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
      }

      articleInput.value = '';
      quantiteInput.value = '';
      uniteInput.value = '';
      categorieInput.value = '';
      chatInput.checked = false;

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

  TabRegistry.register('courses', { title: 'Courses', accent: 'courses', render });
})();
