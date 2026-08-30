// Mode nuit : bascule manuelle stockée en localStorage, sinon suit la
// préférence système (prefers-color-scheme). Le <head> d'index.html applique
// déjà la valeur stockée avant le premier rendu pour éviter un flash — ce
// module gère seulement le bouton de bascule après coup.

const ThemeManager = (() => {
  const STORAGE_KEY = 'dashboard-foyer-theme';

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStored(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  function current() {
    const stored = getStored();
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    setStored(next);
    apply(next);
    return next;
  }

  function init() {
    apply(current());
  }

  return { init, toggle, current };
})();
