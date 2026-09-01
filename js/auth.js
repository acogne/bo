// Authentification Google OAuth (Google Identity Services) + vérification whitelist.
// Expose un objet global `Auth` utilisé par app.js et sheets-api.js.

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

  function init() {
    attemptSilentLogin();
  }

  // Tente une reconnexion sans interaction (pas de popup ni d'écran de
  // consentement) : si le navigateur a encore une session Google active et
  // que l'utilisateur a déjà autorisé l'app une fois, ça reconnecte tout
  // seul à chaque ouverture. Si ça échoue (pas de session, consentement
  // révoqué...), l'écran de login classique reste affiché — pas d'alerte,
  // c'est une tentative silencieuse.
  function attemptSilentLogin(retriesLeft = 20) {
    if (!ensureTokenClient()) {
      if (retriesLeft <= 0) return;
      setTimeout(() => attemptSilentLogin(retriesLeft - 1), 250);
      return;
    }
    tokenClient.requestAccessToken({ prompt: '' });
  }

  function login() {
    if (!ensureTokenClient()) {
      alert("Google n'est pas encore chargé, réessaie dans un instant.");
      return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  function logout() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    currentUser = null;
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
