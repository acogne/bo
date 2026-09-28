// Utilitaires de dates partagés (semaine ISO, semaine calendaire lundi-dimanche,
// parsing tolérant). Utilisé par task-reset.js et les tabs qui gèrent des
// rotations hebdomadaires (Ménage, Enfant garde...).

const DateUtils = (() => {
  function startOfWeekMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = dimanche ... 6 = samedi
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // Numéro de semaine ISO-8601 (1-53), indépendant du fuseau via UTC.
  function isoWeekNumber(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Extrait un entier d'une cellule type "35", "S35", "Semaine 35"...
  function parseWeekNumber(value) {
    if (value === null || value === undefined) return null;
    const match = String(value).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  function toISODate(date = new Date()) {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // Heure/jour "muraux" dans un fuseau donné, indépendamment du fuseau de
  // l'appareil (utile pour un foyer basé à Genève consulté depuis ailleurs).
  // `date` reste un objet Date à minuit local représentant ce jour civil —
  // utilisable tel quel avec getDay()/isoWeekNumber() comme le "now" habituel.
  function zonedNow(timeZone, instant = new Date()) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false
    });
    const parts = dtf.formatToParts(instant).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
    return {
      date: new Date(parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10)),
      hour,
      minute: parseInt(parts.minute, 10)
    };
  }

  return { startOfWeekMonday, isSameDay, isoWeekNumber, parseWeekNumber, toISODate, parseDate, zonedNow };
})();
