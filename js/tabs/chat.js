// Onglet Chat : événements (Chat_Evenements, checkable comme Ménage) +
// médicaments (Chat_Medicaments). Les achats pour le chat (Chat_Achats) ne
// sont PAS dupliqués ici : ils sont gérés directement depuis l'onglet Courses
// (catégorie "Chat"), voir courses.js — un seul endroit où cocher/ajouter.
//
// Médicaments : un traitement a une Fréquence libre ("2 comprimés matin et
// soir") et une Dernière_prise. On réutilise TaskReset.isVisible en mappant
// Dernière_prise -> Dernière_fois avec Fréquence forcée à 'Quotidien' : tant
// qu'aucune prise n'a été enregistrée aujourd'hui (et que le traitement est
// dans sa période Date_début/Date_fin), il reste "à donner". Exposé via
// `ChatTab.getDueMedicaments` / `formatMedicamentLabel` pour que la homepage
// (app.js) les intègre directement dans "Tâches du jour".

const ChatTab = (() => {
  const SHEET_EVENEMENTS = CONFIG.SHEETS.CHAT_EVENEMENTS;
  const SHEET_MEDICAMENTS = CONFIG.SHEETS.CHAT_MEDICAMENTS;

  // ---------- Médicaments ----------

  function isActiveCourse(med, now) {
    const start = DateUtils.parseDate(med['Date_début']);
    if (start) {
      const startDay = new Date(start);
      startDay.setHours(0, 0, 0, 0);
      if (now < startDay) return false;
    }
    const end = DateUtils.parseDate(med['Date_fin']);
    if (end) {
      const endDay = new Date(end);
      endDay.setHours(23, 59, 59, 999);
      if (now > endDay) return false;
    }
    return true;
  }

  async function getDueMedicaments(now = new Date()) {
    const { rows } = await SheetsAPI.getRows(SHEET_MEDICAMENTS);
    return rows.filter(
      (m) => isActiveCourse(m, now) && TaskReset.isVisible({ 'Fréquence': 'Quotidien', 'Dernière_fois': m['Dernière_prise'] }, now)
    );
  }

  function formatMedicamentLabel(m) {
    return ['Chat', m['Nom_médicament'], m['Fréquence']].filter(Boolean).join(' — ');
  }

  async function markMedicamentDone(med) {
    await SheetsAPI.updateRow(SHEET_MEDICAMENTS, med._rowIndex, { ...med, 'Dernière_prise': DateUtils.toISODate() });
  }

  async function renderMedicamentsDue(container) {
    const el = container.querySelector('#chat-medicaments-due');
    try {
      const due = await getDueMedicaments();

      if (due.length === 0) {
        el.innerHTML = '<p class="text-muted">Rien à donner aujourd\'hui 🎉</p>';
        return;
      }

      el.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      due.forEach((m) => chipsWrap.appendChild(renderMedicamentChip(m, container)));
      el.appendChild(chipsWrap);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger les traitements.</p>';
    }
  }

  function renderMedicamentChip(med, container) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-chat';
    chip.dataset.rowIndex = med._rowIndex;
    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name">${escapeHtml([med['Nom_médicament'], med['Fréquence']].filter(Boolean).join(' — '))}</span>
        <span class="task-chip-meta">À donner aujourd'hui</span>
      </span>
    `;
    chip.addEventListener('click', () => onGiveMedicament(chip, med, container));
    return chip;
  }

  async function onGiveMedicament(chip, med, container) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');

    try {
      await markMedicamentDone(med);
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => renderMedicamentsDue(container), 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer, réessaie.");
    }
  }

  async function renderMedicamentsHistorique(container) {
    const el = container.querySelector('#chat-medicaments-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_MEDICAMENTS);

      if (rows.length === 0) {
        el.innerHTML = '<p class="text-muted">Aucun traitement enregistré.</p>';
        return;
      }

      const sorted = [...rows].sort((a, b) => (b['Date_début'] || '').localeCompare(a['Date_début'] || ''));

      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      sorted.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'info-row accent-chat';
        const periode = m['Date_fin']
          ? `Du ${formatDate(m['Date_début'])} au ${formatDate(m['Date_fin'])}`
          : `Depuis le ${formatDate(m['Date_début'])}, en cours`;
        const metaParts = [periode];
        if (m['Dernière_prise']) metaParts.push(`Dernière prise : ${formatDate(m['Dernière_prise'])}`);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml([m['Nom_médicament'], m['Fréquence']].filter(Boolean).join(' — '))}</div>
          <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });
      el.appendChild(wrap);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger l\'historique.</p>';
    }
  }

  async function onAddMedicament(e, container) {
    e.preventDefault();
    const nomInput = container.querySelector('#chat-med-nom');
    const frequenceInput = container.querySelector('#chat-med-frequence');
    const debutInput = container.querySelector('#chat-med-debut');
    const finInput = container.querySelector('#chat-med-fin');
    const rappelInput = container.querySelector('#chat-med-rappel');

    const nom = nomInput.value.trim();
    if (!nom) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const id = await nextId(SHEET_MEDICAMENTS);
      const dateDebut = debutInput.value || DateUtils.toISODate();
      await SheetsAPI.appendRow(SHEET_MEDICAMENTS, {
        'ID': id,
        'Nom_médicament': nom,
        'Fréquence': frequenceInput.value.trim(),
        'Date_début': dateDebut,
        'Date_fin': finInput.value,
        'Dernière_prise': '',
        'Rappel_agenda': rappelInput.checked ? 'Oui' : 'Non'
      });

      if (rappelInput.checked) {
        try {
          await CalendarAPI.createEvent({
            summary: `Chat : ${[nom, frequenceInput.value.trim()].filter(Boolean).join(' — ')}`,
            date: dateDebut,
            recurrenceUntil: finInput.value
          });
        } catch (calErr) {
          console.error(calErr);
          alert("Traitement enregistré, mais impossible de créer le rappel dans l'agenda.");
        }
      }

      nomInput.value = '';
      frequenceInput.value = '';
      debutInput.value = '';
      finInput.value = '';
      rappelInput.checked = false;

      await Promise.all([renderMedicamentsDue(container), renderMedicamentsHistorique(container)]);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter ce traitement, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Événements ----------

  async function renderEvenements(container) {
    const el = container.querySelector('#chat-evenements-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_EVENEMENTS);
      const pending = rows
        .filter((ev) => (ev['Statut'] || '').trim().toLowerCase() !== 'fait')
        .sort((a, b) => (a['Date'] || '').localeCompare(b['Date'] || ''));

      if (pending.length === 0) {
        el.innerHTML = '<p class="text-muted">Rien à prévoir pour le moment 🎉</p>';
        return;
      }

      el.innerHTML = '';
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'task-chips';
      pending.forEach((ev) => chipsWrap.appendChild(renderEvenementChip(ev, container)));
      el.appendChild(chipsWrap);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger les événements.</p>';
    }
  }

  function renderEvenementChip(ev, container) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-chat';
    chip.dataset.rowIndex = ev._rowIndex;

    const metaParts = [formatDate(ev['Date'])];
    if (ev['Type']) metaParts.push(ev['Type']);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name">${escapeHtml(ev['Description'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;

    chip.addEventListener('click', () => onCheckEvenement(chip, ev, container));
    return chip;
  }

  async function onCheckEvenement(chip, ev, container) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy', 'task-chip--done');

    try {
      await SheetsAPI.updateRow(SHEET_EVENEMENTS, ev._rowIndex, { ...ev, 'Statut': 'Fait' });
      setTimeout(() => {
        chip.classList.add('task-chip--exit');
        setTimeout(() => {
          const group = chip.closest('.task-chips');
          chip.remove();
          if (group && group.querySelectorAll('.task-chip').length === 0 && group.parentElement) {
            group.parentElement.innerHTML = '<p class="text-muted">Rien à prévoir pour le moment 🎉</p>';
          }
        }, 300);
      }, 500);
    } catch (err) {
      console.error(err);
      chip.classList.remove('task-chip--busy', 'task-chip--done');
      alert("Impossible d'enregistrer, réessaie.");
    }
  }

  async function onAddEvenement(e, container) {
    e.preventDefault();
    const dateInput = container.querySelector('#chat-evt-date');
    const typeSelect = container.querySelector('#chat-evt-type');
    const descInput = container.querySelector('#chat-evt-description');
    const rappelInput = container.querySelector('#chat-evt-rappel');

    const date = dateInput.value;
    const description = descInput.value.trim();
    if (!date || !description) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const id = await nextId(SHEET_EVENEMENTS);
      await SheetsAPI.appendRow(SHEET_EVENEMENTS, {
        'ID': id,
        'Date': date,
        'Type': typeSelect.value,
        'Description': description,
        'Rappel_agenda': rappelInput.checked ? 'Oui' : 'Non',
        'Statut': 'À faire'
      });

      if (rappelInput.checked) {
        try {
          await CalendarAPI.createEvent({
            summary: `Chat : ${description}`,
            description: typeSelect.value,
            date
          });
        } catch (calErr) {
          console.error(calErr);
          alert("Événement enregistré, mais impossible de créer le rappel dans l'agenda.");
        }
      }

      dateInput.value = '';
      typeSelect.value = 'Vétérinaire';
      descInput.value = '';
      rappelInput.checked = false;

      await renderEvenements(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cet événement, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Onglet ----------

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-chat">
        <h2>Chat</h2>
      </section>

      <section class="card">
        <h3>À donner aujourd'hui</h3>
        <div id="chat-medicaments-due"><p class="text-muted">Chargement…</p></div>
      </section>

      <section class="card">
        <h3>Tous les traitements</h3>
        <div id="chat-medicaments-list"><p class="text-muted">Chargement…</p></div>
      </section>
      <form id="chat-med-add-form" class="quick-add-form">
        <input type="text" id="chat-med-nom" placeholder="Médicament (ex. Antibiotique)" required />
        <input type="text" id="chat-med-frequence" placeholder="Rythme (ex. 2 comprimés matin et soir)" />
        <input type="date" id="chat-med-debut" />
        <input type="date" id="chat-med-fin" />
        <label class="checkbox-label">
          <input type="checkbox" id="chat-med-rappel" /> Ajouter un rappel agenda
        </label>
        <button type="submit" class="btn">Ajouter un traitement</button>
      </form>

      <section class="card">
        <h3>Événements</h3>
        <div id="chat-evenements-list"><p class="text-muted">Chargement…</p></div>
      </section>
      <form id="chat-evt-add-form" class="quick-add-form">
        <input type="date" id="chat-evt-date" required />
        <select id="chat-evt-type">
          <option value="Vétérinaire">Vétérinaire</option>
          <option value="Vaccin">Vaccin</option>
          <option value="Antiparasitaire">Antiparasitaire</option>
          <option value="Toilettage">Toilettage</option>
          <option value="Autre">Autre</option>
        </select>
        <input type="text" id="chat-evt-description" placeholder="Description" required />
        <label class="checkbox-label">
          <input type="checkbox" id="chat-evt-rappel" /> Ajouter un rappel agenda
        </label>
        <button type="submit" class="btn">Ajouter un événement</button>
      </form>

      <section class="card">
        <h3>Achats pour le chat</h3>
        <p class="text-muted">Ajoute et coche les achats directement depuis l'onglet Courses (catégorie "Chat").</p>
        <a href="#/courses" class="btn">Voir dans Courses</a>
      </section>
    `;

    container.querySelector('#chat-med-add-form').addEventListener('submit', (e) => onAddMedicament(e, container));
    container.querySelector('#chat-evt-add-form').addEventListener('submit', (e) => onAddEvenement(e, container));

    await Promise.all([
      renderMedicamentsDue(container),
      renderMedicamentsHistorique(container),
      renderEvenements(container)
    ]);
  }

  // ---------- Utilitaires ----------

  async function nextId(sheetName) {
    const { rows } = await SheetsAPI.getRows(sheetName);
    const maxId = rows.reduce((max, r) => {
      const id = parseInt(r['ID'], 10);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);
    return maxId + 1;
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

  TabRegistry.register('chat', { title: 'Chat', accent: 'chat', render });

  return { getDueMedicaments, formatMedicamentLabel };
})();
