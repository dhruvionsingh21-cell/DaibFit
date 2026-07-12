// netlify/functions/generate-article-summary.js
//
// Called after a user pays ₹11 to unlock an article's AI summary.
// Checks the database for an already-cached summary FIRST — only
// calls OpenAI if no summary exists yet for this article. This means
// the AI is invoked once per article, ever, regardless of how many
// people pay to read the summary.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (separate from the anon key) —
// this is the only function that needs it, because writing the
// cached summary back to the articles table requires bypassing RLS
// (only admins can normally UPDATE articles). Get this key from
// Supabase → Settings → API → service_role secret. NEVER expose this
// key in frontend code — it must only exist as a Netlify env var.

const ALLOWED_ORIGINS = [
  'https://daibfit.in',
  'https://www.daibfit.in',
  'https://daibfit.netlify.app',
];

function corsHeaders(origin) {
  const ok = !origin || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'https://daibfit.in',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };
}

exports.handler = async function (event) {
  const origin = event.headers.origin || '';
  const h = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: h, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { articleId, paymentId } = JSON.parse(event.body || '{}');
    if (!articleId) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Missing articleId' }) };
    if (!paymentId) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Payment verification missing' }) };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
      console.error('[DiabFit Library] Missing env vars for summary generation');
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Server not configured' }) };
    }

    // ── Step 1: fetch the article (using service role — bypasses RLS) ──
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${articleId}&select=id,title,body,ai_summary`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const rows = await getRes.json();
    const article = rows?.[0];
    if (!article) return { statusCode: 404, headers: h, body: JSON.stringify({ error: 'Article not found' }) };

    // ── Step 2: cache hit — return immediately, no OpenAI call ──
    if (article.ai_summary) {
      console.log('[DiabFit Library] Cache hit for article', articleId);
      return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, summary: article.ai_summary, cached: true }) };
    }

    // ── Step 3: cache miss — generate once via OpenAI ──
    console.log('[DiabFit Library] Cache miss — generating summary for', articleId);
    const systemPrompt = `You summarise health articles about diabetes and prediabetes for Indian readers. Write a clear, accurate, 120-150 word summary in plain English. Do not add medical advice beyond what's in the article. Do not claim cures. Stay factual to the source text.`;
    const userPrompt = `Article title: ${article.title}\n\nArticle content:\n${String(article.body).slice(0, 6000)}\n\nWrite a concise summary.`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    if (!aiRes.ok) {
      console.error('[DiabFit Library] OpenAI failed:', aiRes.status, await aiRes.text());
      return { statusCode: 502, headers: h, body: JSON.stringify({ error: 'Could not generate summary' }) };
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || '';

    // ── Step 4: cache it — write back so no future call ever regenerates this ──
    await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${articleId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() }),
    });

    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, summary, cached: false }) };

  } catch (err) {
    console.error('[DiabFit Library] generate-article-summary exception:', err.message);
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
