/**
 * journey/api.js
 * ─────────────────────────────────────────────────────────────
 * All Supabase database reads/writes live here. No other file
 * talks to Supabase directly — this keeps DB logic in one place
 * and makes every other module easier to test and reuse.
 * Depends on: auth.js (DFAuth.getClient())
 * ─────────────────────────────────────────────────────────────
 */

const DFApi = (function () {

  function client() { return DFAuth.getClient(); }
  function uid() { return DFAuth.getUser()?.id; }

  // ── PROFILE ──────────────────────────────────────────────────
  async function getProfile() {
    const { data, error } = await client()
      .from('profiles').select('*').eq('id', uid()).single();
    if (error) { console.error('[DFApi] getProfile:', error.message); return null; }
    return data;
  }

  async function updateProfile(fields) {
    const { data, error } = await client()
      .from('profiles').update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', uid()).select().single();
    if (error) { console.error('[DFApi] updateProfile:', error.message); return null; }
    return data;
  }

  /** Called after a user completes a screening on index.html and lands here with URL params. */
  async function syncAssessmentFromParams(params) {
    const fields = {};
    if (params.risk) fields.last_risk_level = params.risk;
    if (params.score) fields.last_risk_score = parseInt(params.score);
    if (params.bodyAge) fields.last_body_age = parseInt(params.bodyAge);
    if (params.actualAge) fields.last_actual_age = parseInt(params.actualAge);
    if (params.bodyAge && params.actualAge) fields.last_body_age_gap = parseInt(params.bodyAge) - parseInt(params.actualAge);
    if (Object.keys(fields).length === 0) return null;
    fields.last_assessment_at = new Date().toISOString();
    return updateProfile(fields);
  }

  // ── DAILY LOGS ───────────────────────────────────────────────
  function todayStr() { return new Date().toISOString().split('T')[0]; }

  async function getDailyLog(dateStr) {
    const { data, error } = await client()
      .from('daily_logs').select('*').eq('user_id', uid()).eq('log_date', dateStr).maybeSingle();
    if (error) { console.error('[DFApi] getDailyLog:', error.message); return null; }
    return data;
  }

  async function upsertDailyLog(dateStr, fields) {
    const payload = { user_id: uid(), log_date: dateStr, ...fields };
    const { data, error } = await client()
      .from('daily_logs').upsert(payload, { onConflict: 'user_id,log_date' }).select().single();
    if (error) { console.error('[DFApi] upsertDailyLog:', error.message); return null; }
    return data;
  }

  /** Returns logs for the last N days, oldest first. */
  async function getRecentLogs(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];
    const { data, error } = await client()
      .from('daily_logs').select('*').eq('user_id', uid())
      .gte('log_date', sinceStr).order('log_date', { ascending: true });
    if (error) { console.error('[DFApi] getRecentLogs:', error.message); return []; }
    return data || [];
  }

  // ── WEEKLY / MONTHLY REPORTS ─────────────────────────────────
  async function saveWeeklyReport(weekStart, fields) {
    const payload = { user_id: uid(), week_start: weekStart, ...fields };
    const { data, error } = await client()
      .from('weekly_reports').upsert(payload, { onConflict: 'user_id,week_start' }).select().single();
    if (error) { console.error('[DFApi] saveWeeklyReport:', error.message); return null; }
    return data;
  }

  async function saveMonthlyReport(monthStart, fields) {
    const payload = { user_id: uid(), month_start: monthStart, ...fields };
    const { data, error } = await client()
      .from('monthly_reports').upsert(payload, { onConflict: 'user_id,month_start' }).select().single();
    if (error) { console.error('[DFApi] saveMonthlyReport:', error.message); return null; }
    return data;
  }

  async function getWeeklyReports(limit = 12) {
    const { data, error } = await client()
      .from('weekly_reports').select('*').eq('user_id', uid())
      .order('week_start', { ascending: false }).limit(limit);
    if (error) { console.error('[DFApi] getWeeklyReports:', error.message); return []; }
    return data || [];
  }

  async function getMonthlyReports(limit = 12) {
    const { data, error } = await client()
      .from('monthly_reports').select('*').eq('user_id', uid())
      .order('month_start', { ascending: false }).limit(limit);
    if (error) { console.error('[DFApi] getMonthlyReports:', error.message); return []; }
    return data || [];
  }

  // ── ACHIEVEMENTS ─────────────────────────────────────────────
  async function getAchievements() {
    const { data, error } = await client()
      .from('achievements').select('*').eq('user_id', uid());
    if (error) { console.error('[DFApi] getAchievements:', error.message); return []; }
    return data || [];
  }

  /** Unlocks an achievement if not already unlocked. Returns true if newly unlocked. */
  async function unlockAchievement(key) {
    const { data, error } = await client()
      .from('achievements')
      .upsert({ user_id: uid(), achievement_key: key }, { onConflict: 'user_id,achievement_key', ignoreDuplicates: true })
      .select();
    if (error) { console.error('[DFApi] unlockAchievement:', error.message); return false; }
    return data && data.length > 0;
  }

  return {
    getProfile, updateProfile, syncAssessmentFromParams, todayStr,
    getDailyLog, upsertDailyLog, getRecentLogs,
    saveWeeklyReport, saveMonthlyReport, getWeeklyReports, getMonthlyReports,
    getAchievements, unlockAchievement,
  };
})();
