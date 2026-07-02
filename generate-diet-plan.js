// netlify/functions/generate-diet-plan.js
// Generates 30-day Indian diet plan via OpenAI.
// CORS: allows daibfit.in, daibfit.netlify.app, same-origin.

const ALLOWED_ORIGINS = [
  'https://daibfit.in',
  'https://www.daibfit.in',
  'https://daibfit.netlify.app',
];
const VALID_FLAGS = [
  'low physical activity','unhealthy diet','poor sleep','high stress','smoking','heavy alcohol',
  'कम शारीरिक गतिविधि','अस्वास्थ्यकर आहार','खराब नींद','उच्च तनाव','धूम्रपान','अधिक शराब',
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
  if (event.body && event.body.length > 3000) return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };

  try {
    const body = JSON.parse(event.body);
    const { name, riskLevel, bmi, lifestyleFlags, language } = body;

    if (!['moderate', 'high'].includes(riskLevel))
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only for moderate/high risk users' }) };

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY env var');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
    }

    const safeName  = name ? String(name).replace(/<[^>]*>/g,'').trim().slice(0, 60) : '';
    const safeBmi   = (typeof bmi === 'number' && bmi > 10 && bmi < 80) ? bmi : null;
    const safeFlags = Array.isArray(lifestyleFlags)
      ? lifestyleFlags.filter(f => VALID_FLAGS.includes(f)).slice(0, 6)
      : [];
    const lang = language === 'hi' ? 'Hindi' : 'English';

    const systemPrompt = `You are a health-content writer creating a general wellness plan for India — not medical advice. Use accessible Indian foods (dal, sabzi, roti, millets, curd). Warm, encouraging, non-judgmental tone. Always include disclaimer to consult a doctor.`;

    const userPrompt = `30-day wellness plan for someone in India with ${riskLevel} prediabetes screening risk.
${safeName ? `Name: ${safeName}.` : ''} ${safeBmi ? `BMI: ${safeBmi}.` : ''} Risk factors: ${safeFlags.length ? safeFlags.join(', ') : 'none specified'}.
Write in ${lang}. Structure: 1) Encouraging intro 2) Week 1-2 Indian meal suggestions 3) Week 3-4 consistency tips 4) 5 Indian diet tips 5) Closing with DiabFit retest reminder and medical disclaimer.
Under 500 words. Plain text only, no markdown headers.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens:  700,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error('OpenAI failed:', res.status, await res.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to generate plan' }) };
    }

    const data = await res.json();
    const plan = data.choices?.[0]?.message?.content || '';
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, plan }) };

  } catch (err) {
    console.error('generate-diet-plan error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};