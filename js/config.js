// Configuration centrale de l'app — identifiants, whitelist, noms des onglets.
// Aucune logique ici : uniquement des constantes consommées par auth.js / sheets-api.js / les tabs.

const CONFIG = {
  GOOGLE_CLIENT_ID: '62975722072-k8kt3hdkt2tae8qfu29pevf6mrr350r8.apps.googleusercontent.com',
  SHEET_ID: '1hm7cPjHf8zEgTXO7Byvm1OjRnJDrXjHSm3F_qW6Szac',

  // Agenda familial partagé — cible des rappels créés quand "Rappel_agenda" est coché.
  CALENDAR_ID: '06b07df5965d6c12a1689d4d282c393c2753d93e04080cb28095a4a5cea5a0f7@group.calendar.google.com',

  ALLOWED_EMAILS: [
    'arnaudcogne@gmail.com',
    'marjorie.thery@gmail.com'
  ],

  OAUTH_SCOPES: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.events'
  ].join(' '),

  // Noms exacts des onglets du Google Sheet (22 onglets déjà créés et remplis).
  SHEETS: {
    CITATIONS: 'Citations',
    MENAGE_TACHES: 'Ménage_Taches',
    MENAGE_ROTATION: 'Ménage_Rotation',
    COURSES: 'Courses',
    JARDIN: 'Jardin',
    BRICOLAGE: 'Bricolage',
    ENFANT_EVENEMENTS: 'Enfant_Evenements',
    ENFANT_GARDE_HEBDO: 'Enfant_Garde_Hebdo',
    ENFANT_GARDE_ROTATION: 'Enfant_Garde_Rotation',
    ENFANT_NOUNOU_ABSENCES: 'Enfant_Nounou_Absences',
    ENFANT_INFOS: 'Enfant_Infos',
    ENFANT_SUIVI_MALADIE: 'Enfant_Suivi_Maladie',
    CHAT_EVENEMENTS: 'Chat_Evenements',
    CHAT_ACHATS: 'Chat_Achats',
    CHAT_MEDICAMENTS: 'Chat_Medicaments',
    BUDGET: 'Budget',
    ADMIN: 'Admin',
    CONTACTS: 'Contacts',
    REPAS: 'Repas',
    STOCK: 'Stock',
    VEHICULE: 'Véhicule',
    COMPTEURS: 'Compteurs'
  }
};
