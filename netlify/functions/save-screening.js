// netlify/functions/save-screening.js
//
// Saves a completed screening (name, city, risk level) to Supabase.
// Called from the frontend right before showing the social card.
//
// Required environment variables (set in Netlify dashboard):
//   SUPABASE_URL       — your project URL, e.g. https://xxxxx.supabase.co
//   SUPABASE_ANON_KEY  — your project's anon/public API key

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { name, city, state, riskLevel, score, consentGiven } = body;

    if (!name || !city || !riskLevel) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: name, city, riskLevel' }),
      };
    }

    if (!['low', 'moderate', 'high'].includes(riskLevel)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'riskLevel must be low, moderate, or high' }),
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server not configured — missing Supabase credentials' }),
      };
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/screenings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        name: name.trim().slice(0, 100),
        city: city.trim().slice(0, 100),
        state: state ? state.trim().slice(0, 100) : null,
        risk_level: riskLevel,
        score: typeof score === 'number' ? score : null,
        consent_given: !!consentGiven,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase insert failed:', errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to save screening' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('save-screening error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
