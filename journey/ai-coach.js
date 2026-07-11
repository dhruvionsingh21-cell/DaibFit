/**
 * journey/ai-coach.js
 * ─────────────────────────────────────────────────────────────
 * The ONLY AI-powered feature in DaibFit Journey. Everything else
 * (insights, streaks, reports) is rule-based JavaScript.
 *
 * Builds a context object from the user's profile + logs + reports
 * and sends it, along with their question, to the ask-ai-coach
 * Netlify function.
 * ─────────────────────────────────────────────────────────────
 */

const DFAICoach = (function () {
  const API_BASE = '/.netlify/functions';

  /** Assembles the context block the AI needs to answer specifically, not generically. */
  function buildContext(profile, logs, weeklyReports, insights) {
    const { thisWeek } = DFInsights.splitIntoWeeks(logs);
    const weeklyAvgWalk = DFInsights.avg(thisWeek, 'walk_minutes');
    const latestWeeklyReport = weeklyReports?.[0];
    const monthLogs = logs.filter(l => {
      const d = new Date(l.log_date), now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyAvgWalk = DFInsights.avg(monthLogs, 'walk_minutes');
    const weighed = monthLogs.filter(l => l.weight_kg).map(l => l.weight_kg);
    const monthlyWeightChange = weighed.length >= 2 ? +(weighed[weighed.length - 1] - weighed[0]).toFixed(1) : undefined;

    return {
      name: profile?.full_name || '',
      actualAge: profile?.last_actual_age,
      bodyAge: profile?.last_body_age,
      bodyAgeGap: profile?.last_body_age_gap,
      riskLevel: profile?.last_risk_level,
      riskScore: profile?.last_risk_score,
      currentStreak: window._dfCurrentStreak || 0,
      weeklyAvgWalk: weeklyAvgWalk !== null ? Math.round(weeklyAvgWalk) : undefined,
      weeklyConsistency: latestWeeklyReport?.consistency_score,
      monthlyAvgWalk: monthlyAvgWalk !== null ? Math.round(monthlyAvgWalk) : undefined,
      monthlyWeightChange,
      recentInsights: (insights || []).map(i => i.text).slice(0, 3),
    };
  }

  /** Sends the question + context to the AI coach function. Returns the answer text or throws. */
  async function ask(question, profile, logs, weeklyReports, insights, language) {
    const context = buildContext(profile, logs, weeklyReports, insights);
    const res = await fetch(`${API_BASE}/ask-ai-coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context, language }),
    });
    const data = await res.json();
    if (!res.ok || !data.answer) {
      const errMap = {
        invalid_api_key: 'AI coach is temporarily unavailable (configuration issue).',
        quota_exceeded: 'AI coach has reached its usage limit for now. Please try later.',
      };
      throw new Error(errMap[data.error] || 'Could not get a response. Please try again.');
    }
    return data.answer;
  }

  return { ask, buildContext };
})();
