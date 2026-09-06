// Authentification Google OAuth (Google Identity Services) + vérification whitelist.
// Expose un objet global `Auth` utilisé par app.js et sheets-api.js.

// Clés localStorage : le token + son expiration (pour sauter complètement le
// aller-retour Google au rechargement tant qu'il est encore valide), et le
// dernier email connecté (pour pré-sélectionner le compte via `hint` et
// éviter l'écran "choisir un compte" quand plusieurs comptes Google existent
// sur l'appareil).
const AUTH_STORAGE_KEY = 'dashboard-foyer-auth-session';
const AUTH_LAST_EMAIL_KEY = 'dashboard-foyer-last-email';

const Auth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let currentUser = null;
  const listeners = [];

  function onAuthChange(callback) {
    listeners.push(callback);
  }

  function notify() {
    listeners.forEach((cb) => cb(currentUser));
  }

  function getLastEmail() {
    try {
      return localStorage.getItem(AUTH_LAST_EMAIL_KEY) || undefined;
    } catch {
      return undefined;
    }
  }

  function saveSession(token, expiresInSeconds, user) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        token,
        // Marge de 60s pour ne jamais utiliser un token tombé expiré entre-temps.
        expiresAt: Date.now() + (expiresInSeconds * 1000) - 60000,
        user
      }));
      localStorage.setItem(AUTH_LAST_EMAIL_KEY, user.email);
    } catch {
      // Stockage indisponible (navigation privée...) : tant pis, on reste en mémoire.
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session.token || !session.expiresAt || session.expiresAt < Date.now()) return null;
      return session;
    } catch {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // Le script Google (accounts.google.com/gsi/client) est chargé en async :
  // il peut ne pas encore être prêt au DOMContentLoaded. On initialise donc le
  // token client paresseusement, au premier appel réellement nécessaire,
  // plutôt que de risquer une ReferenceError sur `google` à l'init.
  function ensureTokenClient() {
    if (tokenClient) return true;
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      return false;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.OAUTH_SCOPES,
      callback: handleTokenResponse,
      error_callback: (err) => {
        console.error('Erreur OAuth Google :', err);
      }
    });
    return true;
  }

  // Reconnexion immédiate : si un token encore valide a été sauvegardé lors
  // d'une session précédente (même après avoir fermé/rouvert l'app), on
  // restaure la session tout de suite, sans le moindre aller-retour réseau
  // vers Google — l'utilisateur ne voit jamais d'écran de connexion tant que
  // le token n'a pas expiré (généralement 1h).
  function restoreSession() {
    const session = loadSession();
    if (!session) return false;
    accessToken = session.token;
    currentUser = session.user;
    notify();
    return true;
  }

  function init() {
    restoreSession();
    // Même restaurée depuis le cache, on tente un renouvellement silencieux
    // en tâche de fond : s'il aboutit avant l'expiration du token restauré,
    // l'utilisateur ne ressent jamais la coupure. S'il échoue, la session
    // restaurée reste utilisable jusqu'à son expiration.
    attemptSilentLogin();
  }

  // Tente une reconnexion sans interaction (pas de popup ni d'écran de
  // consentement) : si le navigateur a encore une session Google active et
  // que l'utilisateur a déjà autorisé l'app une fois, ça reconnecte tout
  // seul à chaque ouverture. Si ça échoue (pas de session, consentement
  // révoqué...), l'écran de login classique reste affiché — pas d'alerte,
  // c'est une tentative silencieuse. `hint` (dernier email connecté) permet à
  // Google de sauter l'écran "choisir un compte" quand plusieurs comptes
  // Google existent sur l'appareil.
  function attemptSilentLogin(retriesLeft = 20) {
    if (!ensureTokenClient()) {
      if (retriesLeft <= 0) return;
      setTimeout(() => attemptSilentLogin(retriesLeft - 1), 250);
      return;
    }
    tokenClient.requestAccessToken({ prompt: '', hint: getLastEmail() });
  }

  // `prompt: ''` (plutôt que 'consent') laisse Google décider : l'écran de
  // consentement ne réapparaît que si l'utilisateur ne l'a jamais accordé (ou
  // l'a révoqué) — sinon la reconnexion se fait en un minimum d'étapes.
  function login() {
    if (!ensureTokenClient()) {
      alert("Google n'est pas encore chargé, réessaie dans un instant.");
      return;
    }
    tokenClient.requestAccessToken({ prompt: '', hint: getLastEmail() });
  }

  function logout() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    currentUser = null;
    clearSession();
    notify();
  }

  async function handleTokenResponse(response) {
    if (response.error) {
      console.error('Réponse OAuth en erreur :', response);
      return;
    }

    accessToken = response.access_token;

    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        throw new Error(`Impossible de récupérer le profil (${res.status})`);
      }

      const profile = await res.json();

      // Sécurité : seuls les deux emails de la whitelist ont accès à l'app,
      // même si le compte Google a validé l'authentification.
      if (!CONFIG.ALLOWED_EMAILS.includes(profile.email)) {
        alert(`Accès refusé : ${profile.email} n'est pas autorisé sur ce dashboard.`);
        google.accounts.oauth2.revoke(accessToken, () => {});
        accessToken = null;
        currentUser = null;
        notify();
        return;
      }

      currentUser = {
        email: profile.email,
        name: profile.name || profile.email,
        picture: profile.picture || null
      };

      saveSession(accessToken, response.expires_in, currentUser);
      notify();
    } catch (err) {
      console.error('Erreur lors de la vérification du profil :', err);
      accessToken = null;
      currentUser = null;
      notify();
    }
  }

  function getAccessToken() {
    return accessToken;
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return !!currentUser && !!accessToken;
  }

  return { init, login, logout, getAccessToken, getUser, isLoggedIn, onAuthChange };
})();
