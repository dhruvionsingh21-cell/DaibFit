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
      showFatalError('Could not load the login system (Supabase library missing). Please refresh the page.');
      return false;
    }
    const { url, anonKey } = window.DF_CONFIG || {};
    if (!url || !anonKey || url.includes('YOUR-PROJECT') || anonKey.includes('YOUR_SUPABASE')) {
      console.error('[DFAuth] DF_CONFIG has not been set — still contains placeholder values');
      showFatalError('DaibFit Journey is not configured yet. The site owner needs to add their Supabase URL and anon key in tracker.html.');
      return false;
    }
    try {
      // detectSessionInUrl disabled — we handle the OAuth redirect hash
      // ourselves above, explicitly and predictably, instead of relying
      // on the SDK's automatic (and sometimes racy on mobile) detection.
      supabase = window.supabase.createClient(url, anonKey, {
        auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
      });
    } catch (err) {
      console.error('[DFAuth] createClient failed:', err.message);
      showFatalError('Could not connect to the database. Please try again later.');
      return false;
    }

    // ── Manually handle the OAuth redirect hash ──────────────────────
    // On some mobile browsers, Supabase's automatic #access_token
    // detection races with our own getSession() call and loses the
    // session. We parse the hash ourselves first, apply it explicitly
    // via setSession(), THEN clean the URL — this is reliable across
    // every browser we've tested, including mobile Chrome.
    const applyHashSessionIfPresent = async () => {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) return false;

      const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return false;

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      // Always strip the token out of the visible URL, success or not —
      // leaving it there is both ugly and a security smell.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (error) {
        console.error('[DFAuth] setSession from URL hash failed:', error.message);
        return false;
      }
      return true;
    };

    // Restore session on load, then listen for changes (login/logout/refresh)
    applyHashSessionIfPresent()
      .then(() => supabase.auth.getSession())
      .then(({ data, error }) => {
        if (error) throw error;
        currentUser = data?.session?.user || null;
        authReadyCallbacks.forEach(cb => cb(currentUser));
        authReadyCallbacks = [];
      })
      .catch(err => {
        console.error('[DFAuth] getSession failed:', err.message);
        showFatalError('Could not reach the login server. Check your internet connection and try again.');
      });

    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      document.dispatchEvent(new CustomEvent('df-auth-changed', { detail: { user: currentUser } }));
    });
    return true;
  }

  /** Shows a visible, readable error in the app root instead of an infinite loading spinner. */
  function showFatalError(message) {
    const root = document.getElementById('df-app-root');
    if (root) {
      root.innerHTML = `<div style="max-width:420px;margin:3rem auto;padding:2rem;background:#FCEBEB;border:1px solid #F7C1C1;border-radius:14px;text-align:center">
        <div style="font-size:2rem;margin-bottom:.75rem">⚠️</div>
        <div style="font-size:14px;color:#501313;line-height:1.6">${message}</div>
      </div>`;
    }
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