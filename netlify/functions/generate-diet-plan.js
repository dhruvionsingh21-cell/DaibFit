// netlify/functions/generate-diet-plan.js
//
// Calls OpenAI to generate a personalised 30-day Indian diet + activity
// plan for users at moderate or high prediabetes risk.
//
// Required environment variable (set in Netlify dashboard):
//   OPENAI_API_KEY — from platform.openai.com/api-keys

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
    const { name, riskLevel, bmi, lifestyleFlags, language } = body;

    if (!riskLevel || !['moderate', 'high'].includes(riskLevel)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'This endpoint is only for moderate/high risk users' }),
      };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server not configured — missing OpenAI credentials' }),
      };
    }

    const lang = language === 'hi' ? 'Hindi' : 'English';
    const flagsText = Array.isArray(lifestyleFlags) && lifestyleFlags.length
      ? lifestyleFlags.join(', ')
      : 'none specified';

    const systemPrompt = `You are a careful health-content writer creating a general wellness and lifestyle plan, not medical advice. You write practical, encouraging, India-specific diet and activity guidance. You always include a disclaimer that this is not medical advice and the person should consult a doctor. You use accessible, commonly available Indian foods (dal, sabzi, roti, millets, curd, seasonal vegetables) and avoid expensive or hard-to-find ingredients. Keep tone warm, motivating, and non-judgmental — never shaming about weight or food choices.`;

    const userPrompt = `Create a 30-day general wellness plan structured in 4 weekly phases (not 30 individual days) for someone in India with ${riskLevel} prediabetes risk based on a validated screening questionnaire (not a diagnosis).

Context: ${name ? `Name: ${name}. ` : ''}${bmi ? `BMI: ${bmi}. ` : ''}Self-reported lifestyle factors: ${flagsText}.

Write the response in ${lang}.

Structure the plan as:
1. A one-paragraph encouraging intro (not alarming)
2. Week 1-2 focus: small sustainable changes (specific Indian breakfast/lunch/dinner suggestions, a simple daily walk target)
3. Week 3-4 focus: building consistency (slightly more structure, mention of HbA1c retest)
4. A short list of 5 practical tips specific to Indian eating habits (e.g. portion of rice/roti, reducing sugar in chai, snacking choices)
5. A closing line encouraging them to retest on DiabFit in 30 days and reminding them this is general wellness guidance, not medical advice — they should consult a doctor for diagnosis or treatment.

Keep the total response under 500 words. Use simple, warm language. Do not use markdown headers with #, just plain text with clear paragraph breaks.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI call failed:', errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to generate diet plan' }),
      };
    }

    const data = await response.json();
    const planText = data.choices?.[0]?.message?.content || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, plan: planText }),
    };
  } catch (err) {
    console.error('generate-diet-plan error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
