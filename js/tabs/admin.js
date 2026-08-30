// Onglet Admin : démarches administratives (ID, Nom, Type, Date_échéance,
// Récurrence, Rappel_agenda, Statut). Récurrence pilote ce qui se passe quand
// on coche une tâche : 'Mensuel'/'Annuel' -> la date d'échéance avance d'un
// cran et la tâche reste "À faire" (comme un renouvellement de passeport qui
// revient chaque année) ; 'Ponctuel' (ou vide) -> Statut passe à 'Fait' et la
// tâche disparaît, comme une tâche à faire une fois.

(function registerAdminTab() {
  const SHEET = CONFIG.SHEETS.ADMIN;

  function nextDueDate(dateStr, recurrence) {
    const d = DateUtils.parseDate(dateStr);
    if (!d) return null;
    const next = new Date(d);
    if (recurrence === 'Mensuel') next.setMonth(next.getMonth() + 1);
    else if (recurrence === 'Annuel') next.setFullYear(next.getFullYear() + 1);
    else return null;
    return DateUtils.toISODate(next);
  }

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-admin">
        <h2>Admin</h2>
      </section>
      <section id="admin-list" class="task-list">
        <p class="text-muted">Chargement…</p>
      </section>
      <form id="admin-add-form" class="quick-add-form">
        <input type="text" id="admin-add-nom" placeholder="Nom (ex. Renouveler passeport)" required />
        <select id="admin-add-type">
          <option value="Papiers">Papiers</option>
          <option value="Assurance">Assurance</option>
          <option value="Impôts">Impôts</option>
          <option value="Abonnement">Abonnement</option>
          <option value="Autre">Autre</option>
        </select>
        <input type="date" id="admin-add-echeance" required />
        <select id="admin-add-recurrence">
          <option value="Ponctuel">Ponctuel</option>
          <option value="Mensuel">Mensuel</option>
          <option value="Annuel">Annuel</option>
        </select>
        <label class="checkbox-label">
          <input type="checkbox" id="admin-add-rappel" /> Ajouter un rappel agenda
        </label>
        <button type="submit" class="btn">Ajouter une démarche</button>
      </form>
    `;

    container.querySelector('#admin-add-form').addEventListener('submit', (e) => onAdd(e, container));

    await renderList(container);
  }

  async function renderList(container) {
    const listEl = container.querySelector('#admin-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);
      const todo = rows
        .filter((t) => (t['Statut'] || '').trim().toLowerCase() !== 'fait')
        .sort((a, b) => (a['Date_échéance'] || '').localeCompare(b['Date_échéance'] || ''));

      if (todo.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Rien à faire pour le moment 🎉</p>';
        return;
      }

      listEl.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      todo.forEach((t) => chipsWrap.appendChild(renderChip(t, container)));

      const group = document.createElement('div');
      group.className = 'task-group';
      group.appendChild(chipsWrap);
      listEl.appendChild(group);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les démarches.</p>';
    }
  }

  function renderChip(task, container) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-admin';
    chip.dataset.rowIndex = task._rowIndex;

    const due = DateUtils.parseDate(task['Date_échéance']);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = due && due < today;

    const metaParts = [];
    if (task['Date_échéance']) metaParts.push(`${formatDate(task['Date_échéance'])}${overdue ? ' — en retard' : ''}`);
    if (task['Type']) metaParts.push(task['Type']);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('admin')}</span>${escapeHtml(task['Nom'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onCheck(chip, task, container));
    return chip;
  }

  async function onCheck(chip, task, container) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');
    Confetti.burst();

    try {
      const recurrence = (task['Récurrence'] || '').trim();
      const next = nextDueDate(task['Date_échéance'], recurrence);

      if (next) {
        await SheetsAPI.updateRow(SHEET, task._rowIndex, { ...task, 'Date_échéance': next, 'Statut': 'À faire' });

        if ((task['Rappel_agenda'] || '').trim().toLowerCase() === 'oui') {
          try {
            await CalendarAPI.createEvent({ summary: `Admin : ${task['Nom']}`, description: task['Type'] || '', date: next });
          } catch (calErr) {
            console.error(calErr);
          }
        }

        setTimeout(() => renderList(container), 300);
      } else {
        await SheetsAPI.updateRow(SHEET, task._rowIndex, { ...task, 'Statut': 'Fait' });
        setTimeout(() => {
          chip.classList.add('task-chip--exit');
          setTimeout(() => renderList(container), 300);
        }, 500);
      }
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer, réessaie.");
    }
  }

  async function onAdd(e, container) {
    e.preventDefault();
    const nomInput = container.querySelector('#admin-add-nom');
    const typeSelect = container.querySelector('#admin-add-type');
    const echeanceInput = container.querySelector('#admin-add-echeance');
    const recurrenceSelect = container.querySelector('#admin-add-recurrence');
    const rappelInput = container.querySelector('#admin-add-rappel');

    const nom = nomInput.value.trim();
    const echeance = echeanceInput.value;
    if (!nom || !echeance) return;

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
        'Type': typeSelect.value,
        'Date_échéance': echeance,
        'Récurrence': recurrenceSelect.value,
        'Rappel_agenda': rappelInput.checked ? 'Oui' : 'Non',
        'Statut': 'À faire'
      });

      if (rappelInput.checked) {
        try {
          await CalendarAPI.createEvent({ summary: `Admin : ${nom}`, description: typeSelect.value, date: echeance });
        } catch (calErr) {
          console.error(calErr);
          alert("Démarche enregistrée, mais impossible de créer le rappel dans l'agenda.");
        }
      }

      nomInput.value = '';
      typeSelect.value = 'Papiers';
      echeanceInput.value = '';
      recurrenceSelect.value = 'Ponctuel';
      rappelInput.checked = false;

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette démarche, réessaie.");
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

  TabRegistry.register('admin', { title: 'Admin', accent: 'admin', render });
})();
