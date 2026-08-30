// Onglet Contacts : simple carnet d'adresses (ID, Nom, Catégorie, Téléphone,
// Email, Notes). Pas de notion de "fait"/coché ici — c'est une liste de
// référence, pas une liste de tâches — donc pas de task-chip, juste des
// info-row groupées par catégorie, avec liens tel:/mailto: cliquables.

(function registerContactsTab() {
  const SHEET = CONFIG.SHEETS.CONTACTS;

  async function render(container) {
    container.innerHTML = `
      <section class="tab-header">
        <h2>Contacts</h2>
      </section>
      <section id="contacts-list" class="task-list">
        <p class="text-muted">Chargement des contacts…</p>
      </section>
      <form id="contacts-add-form" class="quick-add-form">
        <input type="text" id="contacts-add-nom" placeholder="Nom" required />
        <input type="text" id="contacts-add-categorie" placeholder="Catégorie (ex. Médecin, École, Artisan)" />
        <input type="tel" id="contacts-add-telephone" placeholder="Téléphone" />
        <input type="email" id="contacts-add-email" placeholder="Email" />
        <input type="text" id="contacts-add-notes" placeholder="Notes (optionnel)" />
        <button type="submit" class="btn">Ajouter un contact</button>
      </form>
    `;

    container.querySelector('#contacts-add-form').addEventListener('submit', (e) => onAddContact(e, container));

    await renderList(container);
  }

  async function renderList(container) {
    const listEl = container.querySelector('#contacts-list');
    try {
      const { rows } = await SheetsAPI.getRows(SHEET);

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-muted">Aucun contact enregistré.</p>';
        return;
      }

      const byCategorie = new Map();
      rows.forEach((c) => {
        const cat = c['Catégorie'] || 'Autre';
        if (!byCategorie.has(cat)) byCategorie.set(cat, []);
        byCategorie.get(cat).push(c);
      });

      listEl.innerHTML = '';
      byCategorie.forEach((contacts, categorie) => {
        contacts.sort((a, b) => (a['Nom'] || '').localeCompare(b['Nom'] || ''));

        const group = document.createElement('div');
        group.className = 'task-group';
        group.innerHTML = `<h3 class="task-group-title">${escapeHtml(categorie)}</h3>`;

        const wrap = document.createElement('div');
        wrap.className = 'info-rows';
        contacts.forEach((c) => wrap.appendChild(renderContactRow(c)));

        group.appendChild(wrap);
        listEl.appendChild(group);
      });
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="text-muted">Impossible de charger les contacts.</p>';
    }
  }

  function renderContactRow(c) {
    const row = document.createElement('div');
    row.className = 'info-row';

    const metaParts = [];
    if (c['Téléphone']) metaParts.push(`<a href="tel:${escapeAttr(c['Téléphone'])}">${escapeHtml(c['Téléphone'])}</a>`);
    if (c['Email']) metaParts.push(`<a href="mailto:${escapeAttr(c['Email'])}">${escapeHtml(c['Email'])}</a>`);
    if (c['Notes']) metaParts.push(escapeHtml(c['Notes']));

    row.innerHTML = `
      <div class="info-row-title">${escapeHtml(c['Nom'] || '')}</div>
      <div class="info-row-meta">${metaParts.join(' · ')}</div>
    `;
    return row;
  }

  async function onAddContact(e, container) {
    e.preventDefault();
    const nomInput = container.querySelector('#contacts-add-nom');
    const categorieInput = container.querySelector('#contacts-add-categorie');
    const telephoneInput = container.querySelector('#contacts-add-telephone');
    const emailInput = container.querySelector('#contacts-add-email');
    const notesInput = container.querySelector('#contacts-add-notes');

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
        'Téléphone': telephoneInput.value.trim(),
        'Email': emailInput.value.trim(),
        'Notes': notesInput.value.trim()
      });

      nomInput.value = '';
      categorieInput.value = '';
      telephoneInput.value = '';
      emailInput.value = '';
      notesInput.value = '';

      await renderList(container);
    } catch (err) {
      console.error(err);
      alert("Impossible d'ajouter ce contact, réessaie.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Utilisé pour les valeurs insérées dans des attributs (href tel:/mailto:) —
  // escapeHtml seul ne protège pas les guillemets hors contexte texte.
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  TabRegistry.register('contacts', { title: 'Contacts', accent: '', render });
})();
