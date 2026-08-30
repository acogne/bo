// Fabrique une config d'onglet "liste à faire / fait" simple, sans récurrence.
// Réutilisée par Jardin et Bricolage qui partagent la même structure de
// colonnes (ID, Description, Priorité, Ajouté_par, Date_ajout, Statut).
// Contrairement à Ménage, il n'y a pas de Fréquence/Dernière_fois ici : une
// tâche cochée passe à Statut="Fait" et sort simplement de la liste active.

const TodoListTab = (() => {
  function create({ sheetName, accent, title }) {
    async function render(container) {
      container.innerHTML = `
        <section class="tab-header accent-${accent}">
          <h2>${title}</h2>
        </section>
        <section id="${accent}-list" class="task-list">
          <p class="text-muted">Chargement…</p>
        </section>
        <form id="${accent}-add-form" class="quick-add-form">
          <input type="text" id="${accent}-add-description" placeholder="Description" required />
          <select id="${accent}-add-priorite">
            <option value="Basse">Priorité basse</option>
            <option value="Moyenne" selected>Priorité moyenne</option>
            <option value="Haute">Priorité haute</option>
          </select>
          <button type="submit" class="btn">Ajouter</button>
        </form>
      `;

      container.querySelector(`#${accent}-add-form`).addEventListener('submit', (e) => onAdd(e, container));
      await renderList(container);
    }

    async function renderList(container) {
      const listEl = container.querySelector(`#${accent}-list`);
      try {
        const { rows } = await SheetsAPI.getRows(sheetName);
        const todo = rows.filter((t) => (t['Statut'] || '').trim().toLowerCase() !== 'fait');

        if (todo.length === 0) {
          listEl.innerHTML = '<p class="text-muted">Rien à faire pour le moment 🎉</p>';
          return;
        }

        const order = { Haute: 0, Moyenne: 1, Basse: 2 };
        todo.sort((a, b) => (order[a['Priorité']] ?? 1) - (order[b['Priorité']] ?? 1));

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'task-chips';
        todo.forEach((t) => chipsWrap.appendChild(renderChip(t)));

        listEl.innerHTML = '';
        const group = document.createElement('div');
        group.className = 'task-group';
        group.appendChild(chipsWrap);
        listEl.appendChild(group);
      } catch (err) {
        console.error(err);
        listEl.innerHTML = '<p class="text-muted">Impossible de charger la liste.</p>';
      }
    }

    function renderChip(task) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `task-chip accent-${accent}`;
      chip.dataset.rowIndex = task._rowIndex;

      const metaParts = [];
      if (task['Priorité']) metaParts.push(`Priorité ${task['Priorité'].toLowerCase()}`);
      if (task['Ajouté_par']) metaParts.push(task['Ajouté_par']);

      chip.innerHTML = `
        <span class="task-chip-check" aria-hidden="true"></span>
        <span class="task-chip-body">
          <span class="task-chip-name">${escapeHtml(task['Description'] || '')}</span>
          <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
        </span>
      `;

      chip.addEventListener('click', () => onCheck(chip, task));
      return chip;
    }

    async function onCheck(chip, task) {
      if (chip.classList.contains('task-chip--busy')) return;
      chip.classList.add('task-chip--busy', 'task-chip--done');
      Confetti.burst();

      const updated = { ...task, Statut: 'Fait' };

      try {
        await SheetsAPI.updateRow(sheetName, task._rowIndex, updated);
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
        alert("Impossible d'enregistrer, réessaie.");
      }
    }

    async function onAdd(e, container) {
      e.preventDefault();
      const descInput = container.querySelector(`#${accent}-add-description`);
      const prioriteSelect = container.querySelector(`#${accent}-add-priorite`);

      const description = descInput.value.trim();
      if (!description) return;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const { rows } = await SheetsAPI.getRows(sheetName);
        const maxId = rows.reduce((max, r) => {
          const id = parseInt(r['ID'], 10);
          return isNaN(id) ? max : Math.max(max, id);
        }, 0);

        const user = Auth.getUser();

        await SheetsAPI.appendRow(sheetName, {
          ID: maxId + 1,
          Description: description,
          Priorité: prioriteSelect.value,
          Ajouté_par: user ? user.name || user.email : '',
          Date_ajout: DateUtils.toISODate(),
          Statut: 'À faire'
        });

        descInput.value = '';
        prioriteSelect.value = 'Moyenne';

        await renderList(container);
      } catch (err) {
        console.error(err);
        alert("Impossible d'ajouter, réessaie.");
      } finally {
        submitBtn.disabled = false;
      }
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    return { title, accent, render };
  }

  return { create };
})();
