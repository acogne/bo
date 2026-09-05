// Logique de reset des tâches à fréquence — partagée par Ménage, Jardin, Bricolage.
//
// Principe : une tâche a une Fréquence (Quotidien / Hebdo / Occasionnel) et un
// champ Dernière_fois. Il n'y a AUCUN reset écrit dans le Sheet à minuit ou le
// lundi : la visibilité est recalculée à chaque affichage en comparant
// Dernière_fois à la date courante. C'est ce qui rend le "reset" possible sans
// backend ni cron.
//
// - Quotidien   : visible sauf si Dernière_fois == aujourd'hui
// - Hebdo       : visible sauf si Dernière_fois est dans la semaine courante (lundi-dimanche)
// - Occasionnel : toujours visible ; seule l'ancienneté affichée change

const TaskReset = (() => {
  function isVisible(task, now = new Date()) {
    const freq = (task['Fréquence'] || '').trim().toLowerCase();
    const last = DateUtils.parseDate(task['Dernière_fois']);

    if (!last) return true; // jamais faite -> toujours visible

    if (freq === 'quotidien') {
      return !DateUtils.isSameDay(last, now);
    }
    if (freq === 'hebdo') {
      return DateUtils.startOfWeekMonday(last).getTime() !== DateUtils.startOfWeekMonday(now).getTime();
    }
    // Occasionnel (et toute fréquence inconnue) : jamais masquée automatiquement.
    return true;
  }

  // Champs à écrire dans le Sheet quand une tâche est cochée.
  function markDoneFields(now = new Date()) {
    return {
      'Dernière_fois': DateUtils.toISODate(now),
      'Statut': 'Fait'
    };
  }

  function daysSince(task, now = new Date()) {
    const last = DateUtils.parseDate(task['Dernière_fois']);
    if (!last) return null;
    const lastDay = new Date(last);
    lastDay.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.round((today - lastDay) / (24 * 60 * 60 * 1000));
  }

  function daysSinceLabel(task, now = new Date()) {
    const days = daysSince(task, now);
    return days === null ? 'Jamais fait' : `${days}j`;
  }

  // Seuils d'alerte propres à chaque tâche occasionnelle (colonnes
  // Seuil_orange / Seuil_rouge du Sheet, en nombre de jours depuis
  // Dernière_fois). Une tâche jamais faite est traitée comme "infiniment en
  // retard" : elle atteint n'importe quel seuil défini. Un seuil vide/non
  // numérique est simplement ignoré (pas d'alerte à ce palier pour cette tâche).
  function occasionnelSeverity(task, now = new Date()) {
    const days = daysSince(task, now);
    const effectiveDays = days === null ? Infinity : days;

    const redThreshold = parseInt(task['Seuil_rouge'], 10);
    if (!isNaN(redThreshold) && effectiveDays >= redThreshold) return 'red';

    const orangeThreshold = parseInt(task['Seuil_orange'], 10);
    if (!isNaN(orangeThreshold) && effectiveDays >= orangeThreshold) return 'orange';

    return null;
  }

  return { isVisible, markDoneFields, daysSince, daysSinceLabel, occasionnelSeverity };
})();
