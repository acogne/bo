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

  function weeksSince(task, now = new Date()) {
    const last = DateUtils.parseDate(task['Dernière_fois']);
    if (!last) return null;
    return Math.floor((now - last) / (7 * 24 * 60 * 60 * 1000));
  }

  function ancienneteLabel(task, now = new Date()) {
    const weeks = weeksSince(task, now);
    if (weeks === null) return 'jamais fait';
    if (weeks <= 0) return 'cette semaine';
    if (weeks === 1) return 'il y a 1 semaine';
    return `il y a ${weeks} semaines`;
  }

  return { isVisible, markDoneFields, ancienneteLabel };
})();
