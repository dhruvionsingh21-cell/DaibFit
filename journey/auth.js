/**
 * journey/auth.js
 * ─────────────────────────────────────────────────────────────
 * Handles Google sign-in via Supabase Authentication.
 * No email/password login is supported — Google OAuth only.
 * All other modules read the current user via DFAuth.getUser().
 * ─────────────────────────────────────────────────────────────
 */

const DFAuth = (function () {
  // Supabase client is created once and reused everywhere.
  // Reads config from window.DF_CONFIG (set in tracker.html before this loads).
  let supabase = null;
  let currentUser = null;
  let authReadyCallbacks = [];

  /** Initialise the Supabase client. Must be called once on page load. */
  function init() {
    if (!window.supabase) {
      console.error('[DFAuth] Supabase JS library not loaded — check script tag order');
      return;
    }
    const { url, anonKey } = window.DF_CONFIG || {};
    if (!url || !anonKey) {
      console.error('[DFAuth] Missing DF_CONFIG.url or DF_CONFIG.anonKey');
      return;
    }
    supabase = window.supabase.createClient(url, anonKey);

    // Restore session on load, then listen for changes (login/logout/refresh)
    supabase.auth.getSession().then(({ data }) => {
      currentUser = data?.session?.user || null;
      authReadyCallbacks.forEach(cb => cb(currentUser));
      authReadyCallbacks = [];
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      document.dispatchEvent(new CustomEvent('df-auth-changed', { detail: { user: currentUser } }));
    });
  }

  /** Trigger Google OAuth sign-in. Redirects the browser to Google, then back here. */
  async function signInWithGoogle() {
    if (!supabase) { console.error('[DFAuth] Not initialised'); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/tracker.html' },
    });
    if (error) console.error('[DFAuth] signInWithGoogle error:', error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    currentUser = null;
  }

  /** Returns the current user object, or null if not signed in. */
  function getUser() {
    return currentUser;
  }

  /** Returns true once auth state has been checked (session restored or not). */
  function onReady(callback) {
    if (currentUser !== null || authReadyCallbacks === null) {
      callback(currentUser);
    } else {
      authReadyCallbacks.push(callback);
    }
  }

  /** Exposes the raw Supabase client for api.js to use for DB calls. */
  function getClient() {
    return supabase;
  }

  return { init, signInWithGoogle, signOut, getUser, onReady, getClient };
})();
