// netlify/functions/save-screening.js
//
// Saves a completed screening (name, city, risk level) to Supabase.
// Called from the frontend right before showing the social card.
//
// Required environment variables (set in Netlify dashboard):
//   SUPABASE_URL       — your project URL, e.g. https://xxxxx.supabase.co
//   SUPABASE_ANON_KEY  — your project's anon/public API key

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method not allowed",
      }),
    };
  }

  try {
    console.log("========== NEW REQUEST ==========");

    console.log("Raw body:", event.body);

    const body = JSON.parse(event.body);

    console.log("Parsed body:", body);

    const {
      name,
      city,
      state,
      riskLevel,
      score,
      consentGiven,
    } = body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    console.log("Supabase URL exists:", !!SUPABASE_URL);
    console.log("Supabase Key exists:", !!SUPABASE_ANON_KEY);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing Supabase environment variables",
        }),
      };
    }

    const payload = {
      name,
      city,
      state: state || null,
      risk_level: riskLevel,
      score,
      consent_given: !!consentGiven,
    };

    console.log("Sending to Supabase:");
    console.log(JSON.stringify(payload));

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/screenings`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    console.log("Supabase Status:", response.status);

    const responseText = await response.text();

    console.log("Supabase Response:");
    console.log(responseText);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: responseText,
      };
    }

    return {
      statusCode: 200,
      headers,
      body: responseText,
    };
  } catch (err) {
    console.error("FULL ERROR");
    console.error(err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        stack: err.stack,
      }),
    };
  }
};