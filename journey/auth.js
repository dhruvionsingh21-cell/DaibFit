/**
 * journey/auth.js
 * ─────────────────────────────────────────────────────────────
 * Handles Google sign-in via Supabase Authentication.
 * No email/password login is supported — Google OAuth only.
 * All other modules read the current user via DFAuth.getUser().
 * ─────────────────────────────────────────────────────────────
 */

const DFAuth = (function () {
  let supabase = null;
  let currentUser = null;
  let isReady = false;              // becomes true once initial auth check finishes
  let authReadyCallbacks = [];

  function fireReady() {
    isReady = true;
    const callbacks = authReadyCallbacks;
    authReadyCallbacks = [];
    callbacks.forEach(cb => cb(currentUser));
  }

  /** Shows a visible, readable message in the app root — works even without DevTools (e.g. on mobile). */
  function showStatus(message, isError) {
    const root = document.getElementById('df-app-root');
    if (!root) return;
    root.innerHTML = `<div style="max-width:420px;margin:3rem auto;padding:2rem;background:${isError ? '#FCEBEB' : '#E1F5EE'};border:1px solid ${isError ? '#F7C1C1' : '#9FE1CB'};border-radius:14px;text-align:center">
      <div style="font-size:2rem;margin-bottom:.75rem">${isError ? '⚠️' : '⏳'}</div>
      <div style="font-size:14px;color:${isError ? '#501313' : '#085041'};line-height:1.6">${message}</div>
    </div>`;
  }

  /** Initialise the Supabase client. Must be called once on page load. */
  function init() {
    if (!window.supabase) {
      showStatus('Could not load the login system (Supabase library missing). Please refresh the page.', true);
      return false;
    }
    const { url, anonKey } = window.DF_CONFIG || {};
    if (!url || !anonKey || url.includes('YOUR-PROJECT') || anonKey.includes('YOUR_SUPABASE')) {
      showStatus('DaibFit Journey is not configured yet. The site owner needs to add their Supabase URL and anon key.', true);
      return false;
    }

    try {
      supabase = window.supabase.createClient(url, anonKey, {
        auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
      });
    } catch (err) {
      showStatus('Could not connect to the database: ' + err.message, true);
      return false;
    }

    handleInitialAuth();

    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      document.dispatchEvent(new CustomEvent('df-auth-changed', { detail: { user: currentUser } }));
    });

    return true;
  }

  /**
   * Runs once on page load. If the URL carries an OAuth redirect hash
   * (#access_token=...), applies it directly and uses the session it
   * returns immediately — no second round-trip to getSession() that
   * could race or return stale data. Otherwise restores any existing
   * persisted session as normal.
   */
  async function handleInitialAuth() {
    const hash = window.location.hash;
    const hasTokenInUrl = hash && hash.includes('access_token');

    if (hasTokenInUrl) {
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      // Always strip the token from the visible URL immediately —
      // whether or not it turns out to be valid.
      history.replaceState(null, '', window.location.pathname + window.location.search);

      if (!access_token || !refresh_token) {
        showStatus('Sign-in link was incomplete. Please try signing in again.', true);
        currentUser = null;
        fireReady();
        return;
      }

      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        // Show the REAL error text on screen — critical for diagnosing
        // on a phone where DevTools isn't available.
        showStatus('Sign-in failed: ' + error.message + '<br><br><a href="/tracker.html" style="color:#501313;text-decoration:underline">Try again</a>', true);
        currentUser = null;
        fireReady();
        return;
      }

      // Use the session setSession() just gave us directly — do not
      // re-fetch, to avoid any timing inconsistency.
      currentUser = data?.session?.user || data?.user || null;
      fireReady();
      return;
    }

    // No token in URL — restore any existing persisted session.
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      currentUser = data?.session?.user || null;
      fireReady();
    } catch (err) {
      showStatus('Could not reach the login server: ' + err.message, true);
      currentUser = null;
      fireReady();
    }
  }

  /** Trigger Google OAuth sign-in. Redirects the browser to Google, then back here. */
  async function signInWithGoogle() {
    if (!supabase) { console.error('[DFAuth] Not initialised'); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/tracker.html' },
    });
    if (error) showStatus('Could not start Google sign-in: ' + error.message, true);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    currentUser = null;
  }

  function getUser() {
    return currentUser;
  }

  /** Calls back immediately if auth state is already known, otherwise queues until it is. */
  function onReady(callback) {
    if (isReady) callback(currentUser);
    else authReadyCallbacks.push(callback);
  }

  function getClient() {
    return supabase;
  }

  return { init, signInWithGoogle, signOut, getUser, onReady, getClient };
})();