// Onglet Ménage : liste des tâches (Ménage_Taches) + rappel de la rotation de
// la semaine (Ménage_Rotation). Toute lecture/écriture passe par SheetsAPI ;
// la logique de reset (Quotidien/Hebdo/Occasionnel) passe par TaskReset.

(function registerMenageTab() {
  const SHEET = CONFIG.SHEETS.MENAGE_TACHES;
  const ROTATION_SHEET = CONFIG.SHEETS.MENAGE_ROTATION;

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-menage">
        <h2>Ménage</h2>
        <p class="week-info" id="menage-week-info">Chargement de la rotation…</p>
      </section>
      <section id="menage-list" class="task-list">
        <p class="text-muted">Chargement des tâches…</p>
      </section>
      <form id="menage-add-form" class="quick-add-form">
        <input type="text" id="menage-add-nom" placeholder="Nouvelle tâche" required />
        <input type="text" id="menage-add-categorie" placeholder="Catégorie (ex. Cuisine)" />
        <select id="menage-add-frequence">
          <option value="Quotidien">Quotidien</option>
          <option value="Hebdo">Hebdo</option>
          <option value="Occasionnel">Occasionnel</option>
        </select>
        <input type="text" id="menage-add-assigne" placeholder="Assigné à (optionnel)" />
        <button type="submit" class="btn">Ajouter</button>
      </form>
    `;

    container.querySelector('#menage-add-form').addEventListener('submit', (e) => onAddTask(e, container));

    await Promise.all([renderWeekInfo(container), renderTaskList(container)]);
  }

  async function renderWeekInfo(container) {
    const info = container.querySelector('#menage-week-info');
    try {
      const { rows } = await SheetsAPI.getRows(ROTATION_SHEET);
      const currentWeek = DateUtils.isoWeekNumber(new Date());
      const row = rows.find((r) => DateUtils.parseWeekNumber(r['Semaine']) === currentWeek);

      if (!row) {
        info.textContent = 'Aucune rotation définie pour cette semaine.';
        return;
      }
      info.innerHTML = `Cette semaine : <strong>${escapeHtml(row['Ménage'] || '?')}</strong> fait le ménage · <strong>${escapeHtml(row['Courses'] || '?')}</strong> fait les courses`;
    } catch (err) {
      console.error(err);
      info.textContent = 'Impossible de charger la rotation.';
    }
  }

  async function renderTaskList(container) {
    const listEl = container.querySelector('#menage-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const now = new Date();
      const visibleTasks = rows.filter((t) => TaskReset.isVisible(t, now));

      if (visibleTasks.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucune tâche à faire pour le moment 🎉</p>';
        return;
      }

      const byCategorie = new Map();
      visibleTasks.forEach((t) => {
        const cat = t['Catégorie'] || 'Autre';
        if (!byCategorie.has(cat)) byCategorie.set(cat, []);
        byCategorie.get(cat).push(t);
      });

      listEl.innerHTML = '';
      byCategorie.forEach((tasks, categorie) => {
        const group = document.createElement('div');
        group.className = 'task-group';
        group.innerHTML = `<h3 class="task-group-title">${escapeHtml(categorie)}</h3>`;

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'task-chips';

        tasks.forEach((task) => chipsWrap.appendChild(renderChip(task)));

        group.appendChild(chipsWrap);
        listEl.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les tâches.</p>';
    }
  }

  function renderChip(task) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-menage';
    chip.dataset.rowIndex = task._rowIndex;

    const freq = task['Fréquence'] || '';
    const metaParts = [freq];
    if (freq === 'Occasionnel') {
      metaParts[0] = TaskReset.ancienneteLabel(task);
    }
    if (task['Assigné_à']) metaParts.push(task['Assigné_à']);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name">${escapeHtml(task['Nom'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onCheckTask(chip, task));
    return chip;
  }

  async function onCheckTask(chip, task) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');

    const freq = (task['Fréquence'] || '').trim();
    const updated = { ...task, ...TaskReset.markDoneFields() };

    try {
      await SheetsAPI.updateRow(SHEET, task._rowIndex, updated);

      if (freq === 'Occasionnel') {
        // Reste dans la liste : on rafraîchit juste le libellé d'ancienneté.
        Object.assign(task, updated);
        const meta = chip.querySelector('.task-chip-meta');
        const parts = ['cette semaine'];
        if (task['Assigné_à']) parts.push(task['Assigné_à']);
        meta.textContent = parts.join(' · ');
        chip.classList.remove('task-chip--busy');
        setTimeout(() => chip.classList.remove('task-chip--done'), 700);
      } else {
        // Quotidien/Hebdo : disparaît de la liste jusqu'au prochain reset.
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
      }
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer cette tâche, réessaie.");
    }
  }

  async function onAddTask(e, container) {
    e.preventDefault();
    const nomInput = container.querySelector('#menage-add-nom');
    const categorieInput = container.querySelector('#menage-add-categorie');
    const frequenceSelect = container.querySelector('#menage-add-frequence');
    const assigneInput = container.querySelector('#menage-add-assigne');

    const nom = nomInput.value.trim();
    if (!nom) return;

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
        'Nom': nom,
        'Catégorie': categorieInput.value.trim(),
        'Fréquence': frequenceSelect.value,
        'Dernière_fois': '',
        'Assigné_à': assigneInput.value.trim(),
        'Statut': 'À faire'
      });

      nomInput.value = '';
      categorieInput.value = '';
      assigneInput.value = '';
      frequenceSelect.value = 'Quotidien';

      await renderTaskList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette tâche, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  TabRegistry.register('menage', { title: 'Ménage', accent: 'menage', render });
})();
