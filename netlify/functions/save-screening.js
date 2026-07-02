// netlify/functions/save-screening.js
// Saves screening to Supabase.
// Promo codes bypass payment (stored in PROMO_CODES env var, comma-separated).
// CORS: allows daibfit.in, daibfit.netlify.app, and same-origin (no origin header).

const ALLOWED_ORIGINS = [
  'https://daibfit.in',
  'https://www.daibfit.in',
  'https://daibfit.netlify.app', // Netlify preview URL
];

function getCorsHeaders(origin) {
  const allowed = !origin || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'https://daibfit.in',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };
}

exports.handler = async function(event) {
  const origin = event.headers.origin || '';
  const headers = getCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (event.body && event.body.length > 2000) return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };

  try {
    const body = JSON.parse(event.body);
    const { name, city, state, riskLevel, score, consentGiven } = body;

    // Validate required fields
    if (!name || !city || !riskLevel)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: name, city, riskLevel' }) };
    if (!['low', 'moderate', 'high'].includes(riskLevel))
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid riskLevel' }) };

    const clean = (s, max = 100) => s ? String(s).replace(/<[^>]*>/g, '').trim().slice(0, max) : null;

    const SUPABASE_URL     = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('MISSING env vars: SUPABASE_URL or SUPABASE_ANON_KEY not set in Netlify');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured — env vars missing' }) };
    }

    const insertBody = {
      name:          clean(name, 100),
      city:          clean(city, 100),
      state:         clean(state, 100),
      risk_level:    riskLevel,
      score:         (typeof score === 'number' && score >= 0 && score <= 50) ? score : null,
      consent_given: !!consentGiven,
    };

    console.log('Inserting into Supabase:', JSON.stringify(insertBody));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/screenings`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        apikey:          SUPABASE_ANON_KEY,
        Authorization:   `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer:          'return=minimal',
      },
      body: JSON.stringify(insertBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase insert failed — HTTP', res.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase save failed', detail: errText }) };
    }

    console.log('Supabase insert OK');
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('save-screening exception:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};