// netlify/functions/submit-article.js
// Accepts public article submissions. Always saved as 'pending' —
// enforced both here AND by a database trigger, so even a direct
// API call can't bypass moderation.

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
  if (event.body && event.body.length > 20000) return { statusCode: 413, headers: h, body: JSON.stringify({ error: 'Submission too large' }) };

  try {
    const body = JSON.parse(event.body);
    const { title, category, authorName, body: articleBody, coverImageUrl, videoUrl } = body;

    if (!title || !category || !articleBody) {
      return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Title, category, and content are required' }) };
    }
    if (!['traditional', 'research', 'community'].includes(category)) {
      return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Invalid category' }) };
    }

    const clean = (s, max) => s ? String(s).replace(/<script[\s\S]*?<\/script>/gi, '').trim().slice(0, max) : null;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Server not configured' }) };
    }

    const payload = {
      title: clean(title, 200),
      category,
      author_name: clean(authorName, 100) || 'Anonymous',
      cover_image_url: clean(coverImageUrl, 500),
      video_url: clean(videoUrl, 500),
      body: clean(articleBody, 15000),
      submitted_by: 'public',
      status: 'pending', // also enforced by DB trigger — defence in depth
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[DiabFit Library] submit-article failed:', res.status, err);
      return { statusCode: 502, headers: h, body: JSON.stringify({ error: 'Failed to submit article' }) };
    }

    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, message: 'Submitted for review' }) };

  } catch (err) {
    console.error('[DiabFit Library] submit-article exception:', err.message);
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
