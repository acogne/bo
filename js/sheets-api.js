// Fonctions génériques de lecture/écriture Google Sheets.
// Point d'entrée UNIQUE vers l'API Sheets : les fichiers tabs/*.js ne doivent
// jamais appeler fetch() directement vers l'API Google, seulement ces fonctions.
// Les en-têtes de colonnes sont toujours lus dynamiquement depuis le Sheet
// (jamais codés en dur) pour éviter toute désynchronisation.

const SheetsAPI = (() => {
  const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

  function authHeaders() {
    const token = Auth.getAccessToken();
    if (!token) {
      throw new Error('Utilisateur non authentifié — impossible d\'appeler Google Sheets.');
    }
    return { Authorization: `Bearer ${token}` };
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Erreur API Sheets (${res.status}) : ${body}`);
    }
    return res.json();
  }

  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  async function getRawValues(sheetName, range = '') {
    const a1 = range ? `${sheetName}!${range}` : sheetName;
    const url = `${BASE_URL}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(a1)}`;
    const data = await apiFetch(url);
    return data.values || [];
  }

  // Lit un onglet entier et retourne { headers, rows } où chaque row est un
  // objet { <en-tête>: <valeur>, _rowIndex: <numéro de ligne dans le Sheet> }.
  // _rowIndex sert d'identifiant pour updateRow/updateCell.
  async function getRows(sheetName) {
    const values = await getRawValues(sheetName);
    if (values.length === 0) return { headers: [], rows: [] };

    const [headers, ...dataRows] = values;
    const rows = dataRows.map((row, i) => {
      const obj = { _rowIndex: i + 2 };
      headers.forEach((h, j) => {
        obj[h] = row[j] !== undefined ? row[j] : '';
      });
      return obj;
    });

    return { headers, rows };
  }

  // Ajoute une nouvelle ligne. rowObject est un objet { <en-tête>: <valeur> } ;
  // les colonnes absentes de rowObject sont laissées vides.
  async function appendRow(sheetName, rowObject) {
    const { headers } = await getRows(sheetName);
    const row = headers.map((h) => (rowObject[h] !== undefined ? rowObject[h] : ''));

    const url = `${BASE_URL}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
    return apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    });
  }

  // Remplace toute la ligne rowIndex (numéro de ligne dans le Sheet, via _rowIndex).
  async function updateRow(sheetName, rowIndex, rowObject) {
    const { headers } = await getRows(sheetName);
    const row = headers.map((h) => (rowObject[h] !== undefined ? rowObject[h] : ''));
    const range = `${sheetName}!A${rowIndex}:${colLetter(headers.length)}${rowIndex}`;

    const url = `${BASE_URL}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return apiFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    });
  }

  // Met à jour une seule cellule identifiée par nom de colonne + numéro de ligne.
  async function updateCell(sheetName, rowIndex, columnName, value) {
    const { headers } = await getRows(sheetName);
    const colIndex = headers.indexOf(columnName);
    if (colIndex === -1) {
      throw new Error(`Colonne "${columnName}" introuvable dans l'onglet "${sheetName}".`);
    }
    const range = `${sheetName}!${colLetter(colIndex + 1)}${rowIndex}`;

    const url = `${BASE_URL}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return apiFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[value]] })
    });
  }

  return { getRows, appendRow, updateRow, updateCell };
})();
