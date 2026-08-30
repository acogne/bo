// Création d'événements dans l'agenda familial partagé (Google Calendar).
// Point d'entrée UNIQUE vers l'API Calendar — les fichiers tabs/*.js ne
// doivent jamais appeler fetch() directement vers l'API Google, seulement
// cette fonction. Ne gère que la création (aucune lecture/suppression) : les
// rappels de l'app (Enfant, Chat) l'appellent quand "Rappel_agenda" est coché,
// en plus de l'enregistrement dans le Sheet (jamais à la place).

const CalendarAPI = (() => {
  const BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';
  const TIME_ZONE = 'Europe/Zurich';

  function authHeaders() {
    const token = Auth.getAccessToken();
    if (!token) {
      throw new Error("Utilisateur non authentifié — impossible d'appeler Google Calendar.");
    }
    return { Authorization: `Bearer ${token}` };
  }

  // date: 'yyyy-mm-dd' (obligatoire). time: 'HH:MM' (optionnel — sans heure,
  // événement journée entière). recurrenceUntil: 'yyyy-mm-dd' (optionnel —
  // crée une récurrence quotidienne de `date` jusqu'à cette date incluse,
  // pour les traitements médicaux qui durent plusieurs jours).
  async function createEvent({ summary, description = '', date, time = '', recurrenceUntil = '' }) {
    const calendarId = CONFIG.CALENDAR_ID;
    const url = `${BASE_URL}/${encodeURIComponent(calendarId)}/events`;

    const event = { summary, description };
    if (time) {
      const dateTime = `${date}T${time}:00`;
      event.start = { dateTime, timeZone: TIME_ZONE };
      event.end = { dateTime, timeZone: TIME_ZONE };
    } else {
      event.start = { date };
      event.end = { date };
    }
    if (recurrenceUntil) {
      event.recurrence = [`RRULE:FREQ=DAILY;UNTIL=${recurrenceUntil.replace(/-/g, '')}T235959Z`];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Erreur API Calendar (${res.status}) : ${body}`);
    }
    return res.json();
  }

  return { createEvent };
})();
