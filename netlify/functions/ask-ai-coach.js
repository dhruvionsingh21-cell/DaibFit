// netlify/functions/ask-ai-coach.js
//
// The ONLY AI-powered feature in DaibFit Journey. Called when the user
// clicks "Ask AI" on their dashboard. All other insights (weekly trends,
// streaks, comparisons) are computed with plain JavaScript rules in
// journey/insights.js — never sent to an LLM.
//
// The AI is given full context (body age, risk level, tracker history,
// weekly/monthly progress) so it can answer specific questions like
// "What should I improve first?" or "Why is my Body Age increasing?"

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
  if (event.body && event.body.length > 6000) return { statusCode: 413, headers: h, body: JSON.stringify({ error: 'Payload too large' }) };

  try {
    const body = JSON.parse(event.body);
    const { question, context, language } = body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Please provide a question' }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('[DiabFit Journey] Missing OPENAI_API_KEY');
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Server not configured' }) };
    }

    const safeQuestion = String(question).replace(/<[^>]*>/g, '').trim().slice(0, 300);
    const lang = language === 'hi' ? 'Hindi' : 'English';

    // Build a compact, structured context block from what the frontend sends.
    // Frontend is responsible for assembling this from Supabase data before calling us.
    const c = context || {};
    const contextBlock = [
      c.name ? `Name: ${c.name}` : null,
      c.actualAge ? `Actual age: ${c.actualAge}` : null,
      c.bodyAge ? `Body age: ${c.bodyAge} (gap: ${c.bodyAgeGap > 0 ? '+' : ''}${c.bodyAgeGap} years)` : null,
      c.riskLevel ? `Prediabetes risk level: ${c.riskLevel}` : null,
      c.riskScore ? `Risk score: ${c.riskScore}/26` : null,
      c.currentStreak !== undefined ? `Current daily tracking streak: ${c.currentStreak} days` : null,
      c.weeklyAvgWalk !== undefined ? `This week's average daily walk: ${c.weeklyAvgWalk} min` : null,
      c.weeklyConsistency !== undefined ? `This week's consistency score: ${c.weeklyConsistency}/100` : null,
      c.monthlyAvgWalk !== undefined ? `This month's average daily walk: ${c.monthlyAvgWalk} min` : null,
      c.monthlyWeightChange !== undefined ? `Weight change this month: ${c.monthlyWeightChange} kg` : null,
      c.recentInsights && c.recentInsights.length ? `Recent rule-based insights: ${c.recentInsights.join(' | ')}` : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are the DaibFit Journey Personal Health Coach — a supportive, knowledgeable guide helping Indians reduce their prediabetes risk and Body Age Gap through daily habits. You are not a doctor and must never diagnose or prescribe. You give practical, encouraging, India-specific guidance grounded in the user's actual tracked data below. Keep answers concise (under 200 words), warm, and specific to their numbers — not generic advice. If asked about diet, suggest accessible Indian foods (dal, sabzi, roti, millets). Always end with a brief reminder to consult a doctor for medical decisions.`;

    const userPrompt = `User's current health context:
${contextBlock || 'No tracking data yet.'}

User's question: "${safeQuestion}"

Answer in ${lang}. Be specific to their data above — reference actual numbers where relevant (e.g. "your walking averaged X min this week"). Keep it under 200 words.`;

    console.log('[DiabFit Journey] AI coach question from', c.name || 'user', '—', safeQuestion.slice(0, 50));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }),
    });

    const rawBody = await res.text();

    if (!res.ok) {
      let code = 'unknown', msg = rawBody;
      try { const p = JSON.parse(rawBody); code = p?.error?.code || p?.error?.type || 'unknown'; msg = p?.error?.message || rawBody; } catch (_) {}
      console.error('[DiabFit Journey] OpenAI error:', res.status, code, msg);
      if (res.status === 401) return { statusCode: 401, headers: h, body: JSON.stringify({ error: 'invalid_api_key' }) };
      if (res.status === 429) return { statusCode: 429, headers: h, body: JSON.stringify({ error: 'quota_exceeded' }) };
      return { statusCode: 502, headers: h, body: JSON.stringify({ error: code }) };
    }

    const data = JSON.parse(rawBody);
    const answer = data.choices?.[0]?.message?.content || '';

    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, answer }) };

  } catch (err) {
    console.error('[DiabFit Journey] ask-ai-coach exception:', err.message);
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
