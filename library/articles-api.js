/**
 * library/articles-api.js
 * ─────────────────────────────────────────────────────────────
 * All Supabase reads/writes for the Knowledge Centre live here.
 * Reuses the same Supabase client pattern as journey/auth.js —
 * expects window.DF_CONFIG (url + anonKey) to already be set.
 * ─────────────────────────────────────────────────────────────
 */

const DFArticles = (function () {
  let supabase = null;

  function init() {
    if (!window.supabase) { console.error('[DFArticles] Supabase library not loaded'); return; }
    const { url, anonKey } = window.DF_CONFIG || {};
    if (!url || !anonKey || url.includes('YOUR-PROJECT')) {
      console.error('[DFArticles] DF_CONFIG not set');
      return;
    }
    supabase = window.supabase.createClient(url, anonKey);
  }

  function client() { return supabase; }

  /** Fetch published articles for a given category ('traditional'|'research'|'community'|'all'). */
  async function getPublished(category) {
    let q = supabase.from('articles').select('*').eq('status', 'published').order('created_at', { ascending: false });
    if (category && category !== 'all') q = q.eq('category', category);
    const { data, error } = await q;
    if (error) { console.error('[DFArticles] getPublished:', error.message); return []; }
    return data || [];
  }

  async function getById(id) {
    const { data, error } = await supabase.from('articles').select('*').eq('id', id).single();
    if (error) { console.error('[DFArticles] getById:', error.message); return null; }
    return data;
  }

  /** Current logged-in user's session, if any (for admin check + personalisation). */
  async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  }

  async function signInWithGoogle(redirectPath) {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + redirectPath },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ── ADMIN-ONLY OPERATIONS (RLS enforces actual permission server-side) ──

  async function getAllForAdmin() {
    const { data, error } = await supabase.from('articles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('[DFArticles] getAllForAdmin:', error.message); return []; }
    return data || [];
  }

  async function createArticle(fields) {
    const { data, error } = await supabase.from('articles').insert({ ...fields, submitted_by: 'admin' }).select().single();
    if (error) { console.error('[DFArticles] createArticle:', error.message); throw error; }
    return data;
  }

  async function updateArticle(id, fields) {
    const { data, error } = await supabase.from('articles').update(fields).eq('id', id).select().single();
    if (error) { console.error('[DFArticles] updateArticle:', error.message); throw error; }
    return data;
  }

  async function deleteArticle(id) {
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) { console.error('[DFArticles] deleteArticle:', error.message); throw error; }
    return true;
  }

  async function approveArticle(id) {
    return updateArticle(id, { status: 'published' });
  }

  /** Uploads an image to Supabase Storage, returns its public URL. */
  async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('article-images').upload(path, file);
    if (error) { console.error('[DFArticles] uploadImage:', error.message); throw error; }
    const { data } = supabase.storage.from('article-images').getPublicUrl(path);
    return data.publicUrl;
  }

  // ── PUBLIC SUBMISSION (via Netlify function, no login required) ──
  async function submitPublicArticle(fields) {
    const res = await fetch('/.netlify/functions/submit-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');
    return data;
  }

  // ── AI SUMMARY (after ₹11 payment) ──
  async function requestSummary(articleId, paymentId) {
    const res = await fetch('/.netlify/functions/generate-article-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, paymentId }),
    });
    const data = await res.json();
    if (!res.ok || !data.summary) throw new Error(data.error || 'Could not generate summary');
    return data.summary;
  }

  /** Very small markdown-ish renderer: **bold**, line breaks, - bullets. Escapes HTML first. */
  function renderBody(text) {
    if (!text) return '';
    let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/^- (.+)$/gm, '• $1');
    safe = safe.replace(/\n/g, '<br>');
    return safe;
  }

  /** Converts a YouTube/Vimeo watch URL into an embeddable iframe src. */
  function toEmbedUrl(url) {
    if (!url) return null;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return null;
  }

  return {
    init, client, getPublished, getById, getSession, signInWithGoogle, signOut,
    getAllForAdmin, createArticle, updateArticle, deleteArticle, approveArticle, uploadImage,
    submitPublicArticle, requestSummary, renderBody, toEmbedUrl,
  };
})();
