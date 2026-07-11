// netlify/functions/generate-diet-plan.js
// Generates 30-day Indian diet plan via OpenAI.
// Returns specific OpenAI error codes so frontend can show the right message.

const ALLOWED_ORIGINS = [
  'https://daibfit.in',
  'https://www.daibfit.in',
  'https://daibfit.netlify.app',
];

const VALID_FLAGS = [
  'low physical activity','unhealthy diet','poor sleep','high stress','smoking','heavy alcohol',
  'कम शारीरिक गतिविधि','अस्वास्थ्यकर आहार','खराब नींद','उच्च तनाव','धूम्रपान','अधिक शराब',
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

exports.handler = async function(event) {
  const origin = event.headers.origin || '';
  const h = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers:h, body: JSON.stringify({error:'Method not allowed'}) };
  if (event.body && event.body.length > 3000) return { statusCode:413, headers:h, body: JSON.stringify({error:'Payload too large'}) };

  try {
    const body = JSON.parse(event.body);
    const { name, riskLevel, bmi, lifestyleFlags, language } = body;

    if (!['moderate','high'].includes(riskLevel))
      return { statusCode:400, headers:h, body: JSON.stringify({error:'Only for moderate/high risk users'}) };

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('[DiabFit] OPENAI_API_KEY env var is missing from Netlify');
      return { statusCode:500, headers:h, body: JSON.stringify({error:'api_key_missing', message:'OpenAI key not configured on server'}) };
    }

    const safeName  = name ? String(name).replace(/<[^>]*>/g,'').trim().slice(0,60) : '';
    const safeBmi   = (typeof bmi==='number' && bmi>10 && bmi<80) ? bmi : null;
    const safeFlags = Array.isArray(lifestyleFlags) ? lifestyleFlags.filter(f=>VALID_FLAGS.includes(f)).slice(0,6) : [];
    const lang      = language==='hi' ? 'Hindi' : 'English';

    const systemPrompt = `You are a health-content writer creating a general wellness plan for India — not medical advice. Focus primarily on physical activity progression and lifestyle changes that reduce "body age" (metabolic age vs actual age). Use accessible Indian foods (dal, sabzi, roti, millets, curd) only as supporting content. Warm, encouraging, non-judgmental tone. Always include a disclaimer to consult a doctor.`;

    const userPrompt = `30-day Activity Plan & Body Gap Reduction Plan for someone in India with ${riskLevel} prediabetes screening risk.
${safeName ? `Name: ${safeName}.` : ''} ${safeBmi ? `BMI: ${safeBmi}.` : ''} Risk factors: ${safeFlags.length ? safeFlags.join(', ') : 'none specified'}.
Write in ${lang}. Structure: 1) Encouraging intro connecting activity to reducing body age gap 2) Week 1-2 activity progression + light Indian diet notes 3) Week 3-4 activity progression + consistency tips 4) Five practical tips to lower body age (mix of activity and diet) 5) Closing with DiabFit retest reminder and medical disclaimer.
Under 500 words. Plain text only, no markdown headers.`;

    console.log('[DiabFit] Calling OpenAI for', safeName || 'anonymous', '— risk:', riskLevel, '— lang:', lang);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages:    [{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],
        max_tokens:  700,
        temperature: 0.7,
      }),
    });

    // ── Read body ONCE, then inspect ─────────────────────────────────
    const rawBody = await res.text();
    console.log('[DiabFit] OpenAI HTTP status:', res.status);

    if (!res.ok) {
      // Parse OpenAI error for a specific error code
      let openaiError = 'unknown';
      let openaiMsg   = rawBody;
      try {
        const parsed = JSON.parse(rawBody);
        openaiError  = parsed?.error?.code  || parsed?.error?.type || 'unknown';
        openaiMsg    = parsed?.error?.message || rawBody;
      } catch(_){}

      console.error('[DiabFit] OpenAI error — code:', openaiError, '— msg:', openaiMsg);

      // Return specific codes the frontend can act on
      if (res.status === 401)
        return { statusCode:401, headers:h, body: JSON.stringify({error:'invalid_api_key', message:'OpenAI API key is invalid or belongs to a different project'}) };
      if (res.status === 429)
        return { statusCode:429, headers:h, body: JSON.stringify({error:'quota_exceeded', message:'OpenAI quota/rate limit exceeded — add billing credit at platform.openai.com'}) };
      if (res.status === 404)
        return { statusCode:404, headers:h, body: JSON.stringify({error:'model_not_found', message:'Model gpt-4o-mini not available for this API key'}) };

      return { statusCode:502, headers:h, body: JSON.stringify({error:openaiError, message:openaiMsg.slice(0,300)}) };
    }

    let plan = '';
    try {
      const data = JSON.parse(rawBody);
      plan = data.choices?.[0]?.message?.content || '';
    } catch(e) {
      console.error('[DiabFit] Failed to parse OpenAI response:', rawBody.slice(0,200));
      return { statusCode:502, headers:h, body: JSON.stringify({error:'parse_error'}) };
    }

    console.log('[DiabFit] Diet plan generated OK, length:', plan.length);
    return { statusCode:200, headers:h, body: JSON.stringify({success:true, plan}) };

  } catch(err) {
    console.error('[DiabFit] generate-diet-plan exception:', err.message);
    return { statusCode:500, headers:h, body: JSON.stringify({error:'exception', message:err.message}) };
  }
};
