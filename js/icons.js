// Petites icônes outline (trait arrondi, sans dépendance externe) pour le
// menu burger et les chips de tâches. Chaque entrée est un <svg> autonome en
// `currentColor`, prêt à être injecté via innerHTML et coloré par CSS.

const Icons = (() => {
  const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  const SVGS = {
    accueil: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/></svg>`,

    menage: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3.5" y="9.5" width="17" height="8" rx="3"/><circle cx="8" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="4.5" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r=".9" fill="currentColor" stroke="none"/></svg>`,

    courses: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 8h16l-1.5 10a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 8Z"/><path d="M8 8 9.5 4.5M16 8 14.5 4.5"/><path d="M9 12v4M12 12v4M15 12v4"/></svg>`,

    jardin: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 18c0-7 4-12 12-12 0 8-5 12-12 12Z"/><path d="M6 18c2-4 5-7 9-9"/></svg>`,

    bricolage: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M14.8 6.2a3.5 3.5 0 0 0-4.6 4.4L4.9 15.9a1.6 1.6 0 0 0 2.2 2.2l5.3-5.3a3.5 3.5 0 0 0 4.4-4.6l-2 2-1.8-.3-.3-1.8Z"/></svg>`,

    enfant: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="9" y="9" width="6" height="10" rx="2"/><path d="M10.5 9V6.5a1.5 1.5 0 0 1 3 0V9"/><path d="M10 12.5h4M10 15.5h4"/></svg>`,

    chat: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="15.5" r="3.4"/><circle cx="6.8" cy="10.2" r="1.6"/><circle cx="10.4" cy="7.3" r="1.6"/><circle cx="14.4" cy="7.3" r="1.6"/><circle cx="17.6" cy="10.4" r="1.6"/></svg>`,

    budget: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="8"/><path d="M9.5 9.6c0-1.1 1.1-1.9 2.5-1.9s2.5.8 2.5 1.9-1.1 1.5-2.5 1.9-2.5.8-2.5 1.9 1.1 1.9 2.5 1.9 2.5-.8 2.5-1.9"/><path d="M12 6.3v1.4M12 16.3v1.4"/></svg>`,

    admin: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14 3.5v4h4"/><path d="M9 13h6M9 16h6"/></svg>`,

    contacts: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 4.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 4.5 6.1 1.5 1.5 0 0 1 6 4.5Z"/></svg>`,

    repas: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="14" cy="12" r="7"/><circle cx="14" cy="12" r="2.6"/><path d="M5 5v6a1.5 1.5 0 0 0 3 0V5M6.5 5v14"/></svg>`,

    stock: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 8 12 4l8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/></svg>`,

    vehicule: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4.5 15 6 9.5a2 2 0 0 1 1.9-1.4h8.2A2 2 0 0 1 18 9.5L19.5 15"/><rect x="3.5" y="15" width="17" height="4.5" rx="1.5"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/></svg>`,

    compteurs: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15 15.5 10.5"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>`
  };

  function svg(key) {
    return SVGS[key] || '';
  }

  return { svg };
})();
