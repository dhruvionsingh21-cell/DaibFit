/**
 * journey/tracker.js
 * ─────────────────────────────────────────────────────────────
 * Main app entry point. Decides whether to show the Google
 * sign-in screen or the dashboard, based on auth state.
 * Loaded last, after all other journey/*.js modules.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  let currentLang = 'en';

  function renderLoginScreen(rootEl) {
    const hi = currentLang === 'hi';
    rootEl.innerHTML = `
      <div class="df-login-screen">
        <div class="df-login-icon">🩺</div>
        <h1 class="df-login-title">${hi ? 'DaibFit Journey' : 'DaibFit Journey'}</h1>
        <p class="df-login-sub">${hi
          ? 'अपनी दैनिक आदतों को ट्रैक करें, अपनी बॉडी एज कम करें, और अपनी प्रगति देखें — सब एक जगह।'
          : 'Track your daily habits, reduce your Body Age, and see your progress — all in one place.'}</p>
        <button id="df-google-signin" class="df-google-btn">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.36 0-4.36-1.6-5.07-3.74H.94v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.93 10.68A5.41 5.41 0 0 1 3.65 9c0-.58.1-1.15.28-1.68V4.99H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.01l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.99l2.99 2.33C4.64 5.18 6.64 3.58 9 3.58z"/></svg>
          ${hi ? 'Google से साइन इन करें' : 'Sign in with Google'}
        </button>
        <p class="df-login-note">${hi
          ? 'केवल Google लॉगिन। कोई ईमेल/पासवर्ड आवश्यक नहीं। आपका डेटा निजी रहता है।'
          : 'Google login only. No email/password needed. Your data stays private.'}</p>
        <a href="/" class="df-back-home">← ${hi ? 'होम पर वापस जाएं' : 'Back to home'}</a>
      </div>
    `;
    document.getElementById('df-google-signin').onclick = () => DFAuth.signInWithGoogle();
  }

  function renderTopBar(rootEl, showSignOut) {
    const bar = document.createElement('div');
    bar.className = 'df-topbar';
    bar.innerHTML = `
      <div class="df-topbar-logo">Diab<span>Fit</span> <span class="df-topbar-journey">Journey</span></div>
      ${showSignOut ? `<button id="df-signout-btn" class="df-signout-btn">Sign out</button>` : `<a href="/" class="df-nav-back">← Home</a>`}
    `;
    rootEl.parentElement.insertBefore(bar, rootEl);
    if (showSignOut) {
      document.getElementById('df-signout-btn').onclick = async () => {
        await DFAuth.signOut();
        window.location.reload();
      };
    }
  }

  async function boot() {
    const rootEl = document.getElementById('df-app-root');
    if (!rootEl) { console.error('[DaibFit Journey] #df-app-root not found'); return; }

    // Detect language preference (shared with main site via localStorage, if set)
    try { currentLang = localStorage.getItem('diabfit_lang') || 'en'; } catch (e) {}

    DFAuth.init();

    DFAuth.onReady(async (user) => {
      document.querySelectorAll('.df-topbar').forEach(b => b.remove());
      if (user) {
        renderTopBar(rootEl, true);
        await DFDashboard.render(rootEl, currentLang);
      } else {
        renderTopBar(rootEl, false);
        renderLoginScreen(rootEl);
      }
    });

    // Also react to live auth changes (e.g. after OAuth redirect completes)
    document.addEventListener('df-auth-changed', async (e) => {
      document.querySelectorAll('.df-topbar').forEach(b => b.remove());
      const rootEl2 = document.getElementById('df-app-root');
      if (e.detail.user) {
        renderTopBar(rootEl2, true);
        await DFDashboard.render(rootEl2, currentLang);
      } else {
        renderTopBar(rootEl2, false);
        renderLoginScreen(rootEl2);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
