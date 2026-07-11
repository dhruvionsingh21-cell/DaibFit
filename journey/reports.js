/**
 * journey/reports.js
 * ─────────────────────────────────────────────────────────────
 * Computes and persists weekly/monthly report rows from raw
 * daily_logs. Called on dashboard load (idempotent — upserts,
 * safe to re-run).
 * ─────────────────────────────────────────────────────────────
 */

const DFReports = (function () {

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  function getMonthStart(date) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  }

  /** Generates this week's report from logs and saves it via DFApi. */
  async function generateAndSaveWeeklyReport(logs, insights) {
    const weekStart = getWeekStart(new Date());
    const thisWeekLogs = logs.filter(l => l.log_date >= weekStart);

    const totalWalkMinutes = thisWeekLogs.reduce((s, l) => s + (l.walk_minutes || 0), 0);
    const totalKm = DFInsights.estimateKmWalked(thisWeekLogs);
    const avgSleep = DFInsights.avg(thisWeekLogs, 'sleep_hours');
    const consistencyScore = DFInsights.computeConsistencyScore(thisWeekLogs, 7);

    const report = await DFApi.saveWeeklyReport(weekStart, {
      consistency_score: consistencyScore,
      total_walk_minutes: totalWalkMinutes,
      total_km: totalKm,
      avg_sleep_hours: avgSleep ? +avgSleep.toFixed(1) : null,
      insights: insights.map(i => i.text),
    });
    return report;
  }

  /** Generates this month's report from logs and saves it via DFApi. */
  async function generateAndSaveMonthlyReport(logs, insights) {
    const monthStart = getMonthStart(new Date());
    const thisMonthLogs = logs.filter(l => l.log_date >= monthStart);
    const daysInMonth = new Date().getDate(); // days elapsed so far this month

    const totalWalkMinutes = thisMonthLogs.reduce((s, l) => s + (l.walk_minutes || 0), 0);
    const totalKm = DFInsights.estimateKmWalked(thisMonthLogs);
    const consistencyScore = DFInsights.computeConsistencyScore(thisMonthLogs, daysInMonth);

    const weighed = thisMonthLogs.filter(l => l.weight_kg).map(l => l.weight_kg);
    const weightChange = weighed.length >= 2 ? +(weighed[weighed.length - 1] - weighed[0]).toFixed(1) : null;

    const report = await DFApi.saveMonthlyReport(monthStart, {
      consistency_score: consistencyScore,
      total_walk_minutes: totalWalkMinutes,
      total_km: totalKm,
      weight_change_kg: weightChange,
      insights: insights.map(i => i.text),
    });
    return report;
  }

  return { generateAndSaveWeeklyReport, generateAndSaveMonthlyReport, getWeekStart, getMonthStart };
})();
