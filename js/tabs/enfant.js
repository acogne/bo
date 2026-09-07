// Onglet Enfant : agrège 6 onglets Sheet (garde, événements, absences nounou,
// affaires/tailles, suivi santé). Contrairement à Ménage/Courses, la plupart
// des sections ici sont informatives (pas de "coché = disparaît") ; seule la
// section Affaires utilise le pattern chip cliquable, pour basculer
// À_racheter Oui/Non.

(function registerEnfantTab() {
  const SHEET_EVENEMENTS = CONFIG.SHEETS.ENFANT_EVENEMENTS;
  const SHEET_GARDE_HEBDO = CONFIG.SHEETS.ENFANT_GARDE_HEBDO;
  const SHEET_GARDE_ROTATION = CONFIG.SHEETS.ENFANT_GARDE_ROTATION;
  const SHEET_NOUNOU_ABSENCES = CONFIG.SHEETS.ENFANT_NOUNOU_ABSENCES;
  const SHEET_INFOS = CONFIG.SHEETS.ENFANT_INFOS;
  const SHEET_SUIVI_MALADIE = CONFIG.SHEETS.ENFANT_SUIVI_MALADIE;
  const SHEET_MALADIE_EPISODES = CONFIG.SHEETS.ENFANT_MALADIE_EPISODES;

  // Règles du docteur pour l'alternance Dafalgan/Algifor : 3h minimum entre
  // deux prises quelconques (ce qui permet d'alterner toutes les 3h), 6h
  // minimum entre deux prises du MÊME médicament. Les deux combinées donnent
  // le bon résultat même si l'alternance n'est pas parfaitement respectée.
  const ALTERNANCE_MS = 3 * 3600 * 1000;
  const MEME_MED_MS = 6 * 3600 * 1000;

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header accent-enfant">
        <h2>Enfant</h2>
        <p class="week-info" id="enfant-garde-week-info">Chargement de la garde…</p>
        <p class="week-info" id="enfant-garde-week-next"></p>
      </section>

      <section class="card">
        <h3>Planning type de la semaine</h3>
        <div id="enfant-garde-hebdo" class="schedule-table">
          <p class="text-muted">Chargement…</p>
        </div>
      </section>

      <section class="card">
        <h3>Absences nounou</h3>
        <div id="enfant-absences-list">
          <p class="text-muted">Chargement…</p>
        </div>
      </section>
      <form id="enfant-absence-add-form" class="quick-add-form">
        <input type="date" id="enfant-absence-debut" required />
        <input type="date" id="enfant-absence-fin" required />
        <input type="text" id="enfant-absence-motif" placeholder="Motif (ex. congés, maladie)" />
        <input type="text" id="enfant-absence-notes" placeholder="Notes (optionnel)" />
        <button type="submit" class="btn">Ajouter une absence</button>
      </form>

      <section class="card">
        <h3>Prochains événements</h3>
        <div id="enfant-evenements-list">
          <p class="text-muted">Chargement…</p>
        </div>
      </section>
      <form id="enfant-evenement-add-form" class="quick-add-form">
        <input type="date" id="enfant-evt-date" required />
        <input type="time" id="enfant-evt-heure" />
        <select id="enfant-evt-type">
          <option value="RDV médecin">RDV médecin</option>
          <option value="École">École</option>
          <option value="Anniversaire">Anniversaire</option>
          <option value="Activité">Activité</option>
          <option value="Vacances">Vacances</option>
          <option value="Autre">Autre</option>
        </select>
        <input type="text" id="enfant-evt-description" placeholder="Description" required />
        <input type="text" id="enfant-evt-lieu" placeholder="Lieu (optionnel)" />
        <label class="checkbox-label">
          <input type="checkbox" id="enfant-evt-rappel" /> Ajouter un rappel agenda
        </label>
        <button type="submit" class="btn">Ajouter un événement</button>
      </form>

      <section id="enfant-affaires-section" class="task-list">
        <h3 class="section-title">Affaires enfant</h3>
        <div id="enfant-affaires-list">
          <p class="text-muted">Chargement…</p>
        </div>
      </section>
      <form id="enfant-affaire-add-form" class="quick-add-form">
        <input type="text" id="enfant-affaire-categorie" placeholder="Catégorie (ex. Vêtements, Chaussures)" required />
        <input type="text" id="enfant-affaire-element" placeholder="Élément (ex. Pantalon hiver)" required />
        <input type="text" id="enfant-affaire-taille" placeholder="Taille actuelle" />
        <input type="text" id="enfant-affaire-notes" placeholder="Notes (optionnel)" />
        <button type="submit" class="btn">Ajouter une affaire</button>
      </form>

      <section id="enfant-suivi-section" class="card">
        <h3>Suivi santé</h3>
        <div id="enfant-suivi-content">
          <p class="text-muted">Chargement…</p>
        </div>
      </section>
    `;

    container.querySelector('#enfant-absence-add-form').addEventListener('submit', (e) => onAddAbsence(e, container));
    container.querySelector('#enfant-evenement-add-form').addEventListener('submit', (e) => onAddEvenement(e, container));
    container.querySelector('#enfant-affaire-add-form').addEventListener('submit', (e) => onAddAffaire(e, container));

    await Promise.all([
      renderGardeWeekInfo(container),
      renderGardeHebdo(container),
      renderAbsences(container),
      renderEvenements(container),
      renderAffaires(container),
      renderSuivi(container)
    ]);
  }

  // ---------- Garde : rotation de la semaine ----------

  async function renderGardeWeekInfo(container) {
    const el = container.querySelector('#enfant-garde-week-info');
    const nextEl = container.querySelector('#enfant-garde-week-next');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_GARDE_ROTATION);
      const now = new Date();
      const currentWeek = DateUtils.isoWeekNumber(now);
      const nextWeek = DateUtils.isoWeekNumber(new Date(now.getTime() + 7 * 86400000));
      const row = rows.find((r) => DateUtils.parseWeekNumber(r['Semaine']) === currentWeek);
      const nextRow = rows.find((r) => DateUtils.parseWeekNumber(r['Semaine']) === nextWeek);

      if (!row) {
        el.textContent = 'Aucune rotation définie pour cette semaine.';
      } else {
        el.innerHTML = `Cette semaine : <strong>${escapeHtml(row['Lieu_alternant'] || '?')}</strong>`;
      }

      if (!nextRow) {
        nextEl.textContent = 'Semaine prochaine : aucune rotation définie.';
      } else {
        nextEl.innerHTML = `Semaine prochaine : <strong>${escapeHtml(nextRow['Lieu_alternant'] || '?')}</strong>`;
      }
    } catch (err) {
      console.error(err);
      el.textContent = 'Impossible de charger la rotation.';
    }
  }

  // ---------- Garde : planning type (Matin / Après-midi par jour) ----------

  async function renderGardeHebdo(container) {
    const el = container.querySelector('#enfant-garde-hebdo');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_GARDE_HEBDO);

      if (rows.length === 0) {
        el.innerHTML = '<p class="text-muted">Aucun planning défini.</p>';
        return;
      }

      el.innerHTML = '';
      rows.forEach((row) => {
        const line = document.createElement('div');
        line.className = 'schedule-row';
        line.innerHTML = `
          <span class="schedule-day">${escapeHtml(row['Jour'] || '')}</span>
          <span class="schedule-detail">${escapeHtml(row['Matin'] || '?')} · ${escapeHtml(row['Après-midi_type'] || '?')}</span>
        `;
        el.appendChild(line);
      });
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger le planning.</p>';
    }
  }

  // ---------- Absences nounou ----------

  async function renderAbsences(container) {
    const el = container.querySelector('#enfant-absences-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_NOUNOU_ABSENCES);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = rows
        .filter((a) => {
          const fin = parseFrDate(a['Date_fin']);
          return !fin || fin >= today;
        })
        .sort((a, b) => {
          const da = parseFrDate(a['Date_début']);
          const db = parseFrDate(b['Date_début']);
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        });

      if (upcoming.length === 0) {
        el.innerHTML = '<p class="text-muted">Aucune absence prévue 🎉</p>';
        return;
      }

      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      upcoming.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'info-row accent-enfant';
        const metaParts = [];
        if (a['Motif']) metaParts.push(a['Motif']);
        if (a['Notes']) metaParts.push(a['Notes']);
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(formatDateRange(a['Date_début'], a['Date_fin']))}</div>
          <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });
      el.appendChild(wrap);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger les absences.</p>';
    }
  }

  async function onAddAbsence(e, container) {
    e.preventDefault();
    const debutInput = container.querySelector('#enfant-absence-debut');
    const finInput = container.querySelector('#enfant-absence-fin');
    const motifInput = container.querySelector('#enfant-absence-motif');
    const notesInput = container.querySelector('#enfant-absence-notes');

    const debut = debutInput.value;
    const fin = finInput.value;
    if (!debut || !fin) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const id = await nextId(SHEET_NOUNOU_ABSENCES);
      await SheetsAPI.appendRow(SHEET_NOUNOU_ABSENCES, {
        'ID': id,
        'Date_début': isoInputToFr(debut),
        'Date_fin': isoInputToFr(fin),
        'Motif': motifInput.value.trim(),
        'Notes': notesInput.value.trim()
      });

      debutInput.value = '';
      finInput.value = '';
      motifInput.value = '';
      notesInput.value = '';

      await renderAbsences(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette absence, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Événements ----------

  async function renderEvenements(container) {
    const el = container.querySelector('#enfant-evenements-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_EVENEMENTS);
      const today = DateUtils.toISODate();
      const upcoming = rows
        .filter((ev) => (ev['Date'] || '') >= today)
        .sort((a, b) => {
          const da = `${a['Date'] || ''} ${a['Heure'] || ''}`;
          const db = `${b['Date'] || ''} ${b['Heure'] || ''}`;
          return da.localeCompare(db);
        });

      if (upcoming.length === 0) {
        el.innerHTML = '<p class="text-muted">Aucun événement à venir.</p>';
        return;
      }

      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'info-rows';
      upcoming.forEach((ev) => {
        const row = document.createElement('div');
        row.className = 'info-row accent-enfant';
        const metaParts = [ev['Type']];
        if (ev['Lieu']) metaParts.push(ev['Lieu']);
        const when = [formatDate(ev['Date']), ev['Heure']].filter(Boolean).join(' · ');
        row.innerHTML = `
          <div class="info-row-title">${escapeHtml(ev['Description'] || '')}</div>
          <div class="info-row-meta">${escapeHtml(when)} · ${escapeHtml(metaParts.filter(Boolean).join(' · '))}</div>
        `;
        wrap.appendChild(row);
      });
      el.appendChild(wrap);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger les événements.</p>';
    }
  }

  async function onAddEvenement(e, container) {
    e.preventDefault();
    const dateInput = container.querySelector('#enfant-evt-date');
    const heureInput = container.querySelector('#enfant-evt-heure');
    const typeSelect = container.querySelector('#enfant-evt-type');
    const descInput = container.querySelector('#enfant-evt-description');
    const lieuInput = container.querySelector('#enfant-evt-lieu');
    const rappelInput = container.querySelector('#enfant-evt-rappel');

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
        'Heure': heureInput.value,
        'Type': typeSelect.value,
        'Description': description,
        'Lieu': lieuInput.value.trim(),
        'Rappel_agenda': rappelInput.checked ? 'Oui' : 'Non'
      });

      if (rappelInput.checked) {
        try {
          await CalendarAPI.createEvent({
            summary: `Enfant : ${description}`,
            description: [typeSelect.value, lieuInput.value.trim()].filter(Boolean).join(' · '),
            date,
            time: heureInput.value
          });
        } catch (calErr) {
          console.error(calErr);
          alert("Événement enregistré, mais impossible de créer le rappel dans l'agenda.");
        }
      }

      dateInput.value = '';
      heureInput.value = '';
      typeSelect.value = 'RDV médecin';
      descInput.value = '';
      lieuInput.value = '';
      rappelInput.checked = false;

      await renderEvenements(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cet événement, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Affaires enfant (tailles / à racheter) ----------

  function isARacheter(item) {
    return (item['À_racheter'] || '').trim().toLowerCase() === 'oui';
  }

  async function renderAffaires(container) {
    const el = container.querySelector('#enfant-affaires-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET_INFOS);

      if (rows.length === 0) {
        el.innerHTML = '<p class="text-muted">Aucune affaire enregistrée.</p>';
        return;
      }

      const byCategorie = new Map();
      rows.forEach((item) => {
        const cat = item['Catégorie'] || 'Autre';
        if (!byCategorie.has(cat)) byCategorie.set(cat, []);
        byCategorie.get(cat).push(item);
      });

      el.innerHTML = '';
      byCategorie.forEach((items, categorie) => {
        const group = document.createElement('div');
        group.className = 'task-group';
        group.innerHTML = `<h4 class="task-group-title">${escapeHtml(categorie)}</h4>`;

        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'task-chips';
        items.forEach((item) => chipsWrap.appendChild(renderAffaireChip(item)));

        group.appendChild(chipsWrap);
        el.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger les affaires.</p>';
    }
  }

  function renderAffaireChip(item) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'task-chip accent-enfant';
    chip.dataset.rowIndex = item._rowIndex;
    if (isARacheter(item)) chip.classList.add('task-chip--done');

    fillAffaireChip(chip, item);

    chip.addEventListener('click', () => onToggleAffaire(chip, item));
    return chip;
  }

  function fillAffaireChip(chip, item) {
    const metaParts = [];
    if (item['Taille_actuelle']) metaParts.push(`Taille ${item['Taille_actuelle']}`);
    metaParts.push(isARacheter(item) ? 'À racheter' : 'OK');
    if (item['Notes']) metaParts.push(item['Notes']);

    chip.innerHTML = `
      <span class="task-chip-check" aria-hidden="true"></span>
      <span class="task-chip-body">
        <span class="task-chip-name"><span class="task-chip-icon">${Icons.svg('enfant')}</span>${escapeHtml(item['Élément'] || '')}</span>
        <span class="task-chip-meta">${escapeHtml(metaParts.join(' · '))}</span>
      </span>
    `;
  }

  async function onToggleAffaire(chip, item) {
    if (chip.classList.contains('task-chip--busy')) return;
    chip.classList.add('task-chip--busy');

    const nextValue = isARacheter(item) ? 'Non' : 'Oui';
    const updated = { ...item, 'À_racheter': nextValue };

    try {
      await SheetsAPI.updateRow(SHEET_INFOS, item._rowIndex, updated);
      Object.assign(item, updated);
      chip.classList.toggle('task-chip--done', isARacheter(item));
      fillAffaireChip(chip, item);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer cette affaire, réessaie.");
    } finally {
      chip.classList.remove('task-chip--busy');
    }
  }

  async function onAddAffaire(e, container) {
    e.preventDefault();
    const categorieInput = container.querySelector('#enfant-affaire-categorie');
    const elementInput = container.querySelector('#enfant-affaire-element');
    const tailleInput = container.querySelector('#enfant-affaire-taille');
    const notesInput = container.querySelector('#enfant-affaire-notes');

    const categorie = categorieInput.value.trim();
    const element = elementInput.value.trim();
    if (!categorie || !element) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const id = await nextId(SHEET_INFOS);
      await SheetsAPI.appendRow(SHEET_INFOS, {
        'ID': id,
        'Catégorie': categorie,
        'Élément': element,
        'Taille_actuelle': tailleInput.value.trim(),
        'À_racheter': 'Non',
        'Notes': notesInput.value.trim()
      });

      categorieInput.value = '';
      elementInput.value = '';
      tailleInput.value = '';
      notesInput.value = '';

      await renderAffaires(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette affaire, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---------- Suivi santé (dossier maladie) ----------
  // Un seul dossier ouvert à la fois (Enfant_Maladie_Episodes.Statut = 'Ouvert').
  // Toutes les entrées de suivi (Enfant_Suivi_Maladie) sont rattachées au
  // dossier via Episode_ID et s'affichent dans une timeline unique.

  async function getOpenEpisode() {
    const { rows } = await SheetsAPI.getRows(SHEET_MALADIE_EPISODES);
    return rows.find((r) => (r['Statut'] || '').trim().toLowerCase() === 'ouvert') || null;
  }

  async function renderSuivi(container) {
    const el = container.querySelector('#enfant-suivi-content');
    try {
      const episode = await getOpenEpisode();

      // Un dossier ouvert doit sauter aux yeux : la section remonte tout en
      // haut de l'onglet (juste sous le titre) tant qu'il reste ouvert. Sans
      // dossier, elle garde sa place naturelle en bas du template.
      const suiviSection = container.querySelector('#enfant-suivi-section');
      const header = container.querySelector('.tab-header');
      if (episode && suiviSection && header) {
        header.after(suiviSection);
      }

      if (!episode) {
        el.innerHTML = `
          <p class="text-muted">Aucun dossier en cours.</p>
          <button type="button" class="btn" id="enfant-suivi-open-btn">🤒 L'enfant est malade</button>
        `;
        el.querySelector('#enfant-suivi-open-btn').addEventListener('click', () => onOpenDossier(container));
        return;
      }

      const { rows: allEntries } = await SheetsAPI.getRows(SHEET_SUIVI_MALADIE);
      const entries = allEntries.filter((e) => String(e['Episode_ID']) === String(episode['ID']));
      const sorted = [...entries].sort((a, b) => (b['Date_heure'] || '').localeCompare(a['Date_heure'] || ''));

      const now = new Date();
      const dafalgan = computeMedStatus(entries, 'Dafalgan', now);
      const algifor = computeMedStatus(entries, 'Algifor', now);

      el.innerHTML = `
        <p class="week-info">Dossier ouvert le ${escapeHtml(formatDateTime(episode['Date_ouverture']))}</p>

        <div class="suivi-meds">
          ${renderMedButton('Dafalgan', dafalgan)}
          ${renderMedButton('Algifor', algifor)}
        </div>

        <form id="enfant-suivi-temp-form" class="quick-add-form">
          <input type="text" inputmode="decimal" id="enfant-suivi-temp-valeur" placeholder="Température (ex. 38.5)" required />
          <button type="submit" class="btn">Ajouter une température</button>
        </form>

        <form id="enfant-suivi-obs-form" class="quick-add-form">
          <input type="text" id="enfant-suivi-obs-valeur" placeholder="Observation (ex. régurgite, refuse de manger…)" required />
          <button type="submit" class="btn">Ajouter une observation</button>
        </form>

        <div class="info-rows" id="enfant-suivi-timeline"></div>

        <button type="button" class="btn-secondary" id="enfant-suivi-close-btn">Clôturer ce dossier</button>
      `;

      const timelineEl = el.querySelector('#enfant-suivi-timeline');
      if (sorted.length === 0) {
        timelineEl.innerHTML = '<p class="text-muted">Aucun relevé pour ce dossier.</p>';
      } else {
        sorted.forEach((entry) => {
          const row = document.createElement('div');
          row.className = 'info-row accent-enfant';
          const metaParts = [formatDateTime(entry['Date_heure'])];
          if (entry['Saisi_par']) metaParts.push(entry['Saisi_par']);
          row.innerHTML = `
            <div class="info-row-title">${escapeHtml(suiviEntryLabel(entry))}</div>
            <div class="info-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
          `;
          timelineEl.appendChild(row);
        });
      }

      el.querySelectorAll('.suivi-med-btn').forEach((btn) => {
        btn.addEventListener('click', () => onGiveMedicament(container, episode, btn.dataset.med));
      });
      el.querySelector('#enfant-suivi-temp-form').addEventListener('submit', (e) => onAddTemp(e, container, episode));
      el.querySelector('#enfant-suivi-obs-form').addEventListener('submit', (e) => onAddObs(e, container, episode));
      el.querySelector('#enfant-suivi-close-btn').addEventListener('click', () => onCloseDossier(container, episode));
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="text-muted">Impossible de charger le suivi santé.</p>';
    }
  }

  function suiviEntryLabel(entry) {
    const type = entry['Type'];
    const valeur = entry['Valeur'] || '';
    if (type === 'Observation') return valeur;
    if (type === 'Médicament') return `${valeur} donné`;
    return `${type} — ${valeur}`;
  }

  function computeMedStatus(entries, med, now) {
    const doses = entries
      .filter((e) => e['Type'] === 'Médicament')
      .map((e) => ({ med: e['Valeur'], time: DateUtils.parseDate(e['Date_heure']) }))
      .filter((d) => d.time)
      .sort((a, b) => b.time - a.time);

    const lastAny = doses[0];
    const lastSame = doses.find((d) => d.med === med);

    let nextAllowedMs = 0;
    if (lastAny) nextAllowedMs = Math.max(nextAllowedMs, lastAny.time.getTime() + ALTERNANCE_MS);
    if (lastSame) nextAllowedMs = Math.max(nextAllowedMs, lastSame.time.getTime() + MEME_MED_MS);

    const nextAllowed = new Date(nextAllowedMs);
    return { ok: now.getTime() >= nextAllowedMs, nextAllowed };
  }

  function renderMedButton(med, status) {
    if (status.ok) {
      return `<button type="button" class="btn suivi-med-btn" data-med="${med}">Donner ${med}</button>`;
    }
    return `<button type="button" class="btn suivi-med-btn" data-med="${med}" disabled>${escapeHtml(med)} — possible ${escapeHtml(formatCountdown(status.nextAllowed))}</button>`;
  }

  function formatCountdown(nextAllowed) {
    const diffMs = nextAllowed.getTime() - Date.now();
    if (diffMs <= 0) return 'maintenant';
    const totalMin = Math.ceil(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const remaining = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
    const timeLabel = nextAllowed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `dans ${remaining} (${timeLabel})`;
  }

  async function addSuiviEntry(episode, type, valeur) {
    const id = await nextId(SHEET_SUIVI_MALADIE);
    const user = Auth.getUser();
    await SheetsAPI.appendRow(SHEET_SUIVI_MALADIE, {
      'ID': id,
      'Date_heure': new Date().toISOString(),
      'Type': type,
      'Valeur': valeur,
      'Saisi_par': user ? (user.name || user.email) : '',
      'Episode_ID': episode['ID']
    });
  }

  async function onOpenDossier(container) {
    const btn = container.querySelector('#enfant-suivi-open-btn');
    if (btn) btn.disabled = true;
    try {
      const id = await nextId(SHEET_MALADIE_EPISODES);
      const user = Auth.getUser();
      await SheetsAPI.appendRow(SHEET_MALADIE_EPISODES, {
        'ID': id,
        'Date_ouverture': new Date().toISOString(),
        'Date_fermeture': '',
        'Statut': 'Ouvert',
        'Saisi_par': user ? (user.name || user.email) : ''
      });
      await renderSuivi(container);
      refreshMaladieShortcut();
    } catch (err) {
      console.error(err);
      alert("Impossible d'ouvrir le dossier, réessaie.");
      if (btn) btn.disabled = false;
    }
  }

  async function onCloseDossier(container, episode) {
    if (!confirm('Clôturer ce dossier maladie ?')) return;
    const btn = container.querySelector('#enfant-suivi-close-btn');
    if (btn) btn.disabled = true;
    try {
      await SheetsAPI.updateRow(SHEET_MALADIE_EPISODES, episode._rowIndex, {
        ...episode,
        'Date_fermeture': new Date().toISOString(),
        'Statut': 'Fermé'
      });
      await renderSuivi(container);
      refreshMaladieShortcut();
    } catch (err) {
      console.error(err);
      alert('Impossible de clôturer le dossier, réessaie.');
      if (btn) btn.disabled = false;
    }
  }

  async function onGiveMedicament(container, episode, med) {
    const btn = container.querySelector(`.suivi-med-btn[data-med="${med}"]`);
    if (btn) btn.disabled = true;
    try {
      await addSuiviEntry(episode, 'Médicament', med);
      await renderSuivi(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'enregistrer cette prise, réessaie.");
      if (btn) btn.disabled = false;
    }
  }

  async function onAddTemp(e, container, episode) {
    e.preventDefault();
    const input = container.querySelector('#enfant-suivi-temp-valeur');
    const valeur = input.value.trim();
    if (!valeur) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await addSuiviEntry(episode, 'Température', valeur);
      await renderSuivi(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette température, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function onAddObs(e, container, episode) {
    e.preventDefault();
    const input = container.querySelector('#enfant-suivi-obs-valeur');
    const valeur = input.value.trim();
    if (!valeur) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await addSuiviEntry(episode, 'Observation', valeur);
      await renderSuivi(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter cette observation, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
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

  function formatDateTime(value) {
    const d = DateUtils.parseDate(value);
    if (!d) return value || '';
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Les absences nounou sont saisies via <input type="date"> (valeur ISO
  // yyyy-mm-dd) mais stockées et affichées au format européen jj/mm/aaaa,
  // comme demandé — d'où ces deux helpers dédiés plutôt que DateUtils, qui
  // lui reste en ISO pour tout le reste de l'app.
  function isoInputToFr(isoValue) {
    const [y, m, d] = String(isoValue).split('-');
    return `${d}/${m}/${y}`;
  }

  function parseFrDate(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return DateUtils.parseDate(value);
    const [, d, m, y] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }

  function formatDateRange(debut, fin) {
    if (!debut && !fin) return '';
    if (debut && fin) return `Du ${debut} au ${fin}`;
    return debut || fin;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  TabRegistry.register('enfant', { title: 'Enfant', accent: 'enfant', render });
})();
