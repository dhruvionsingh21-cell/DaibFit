/**
 * journey/reminders.js
 * ─────────────────────────────────────────────────────────────
 * Browser-based reminder system using the Notification API and
 * localStorage scheduling. This is a client-side MVP: reminders
 * only fire while DaibFit Journey is open in a browser tab (or
 * via a Service Worker if the browser supports background sync).
 *
 * For true push notifications when the app is fully closed, a
 * server-side scheduler (e.g. a Netlify scheduled function +
 * Web Push or WhatsApp API) would be needed — noted as a
 * future upgrade, not built here.
 * ─────────────────────────────────────────────────────────────
 */

const DFReminders = (function () {
  const STORAGE_KEY = 'df_journey_reminder_log';

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
  }

  function getReminderLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function setReminderLog(log) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }

  function fireNotification(title, body) {
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/favicon.ico' });
  }

  /**
   * Call this once per page load. Checks profile reminder preferences
   * and fires any that are due (daily/weekly/monthly), respecting a
   * "once per period" guard via localStorage so it doesn't spam.
   */
  function checkAndFireDue(profile) {
    if (!profile) return;
    if (Notification.permission !== 'granted') return;

    const log = getReminderLog();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const hour = now.getHours();

    // Daily reminder — fires once per day, after the configured hour
    if (profile.daily_reminder_enabled && hour >= (profile.reminder_hour ?? 19)) {
      if (log.lastDaily !== todayStr) {
        fireNotification('DaibFit Journey', "Don't forget today's health check-in — takes under 60 seconds.");
        log.lastDaily = todayStr;
      }
    }

    // Weekly reminder — fires once per ISO week, on Sunday evening
    if (profile.weekly_reminder_enabled && now.getDay() === 0 && hour >= 18) {
      const weekKey = getISOWeekKey(now);
      if (log.lastWeekly !== weekKey) {
        fireNotification('Your weekly report is ready', 'See how your walking, sleep and consistency trended this week.');
        log.lastWeekly = weekKey;
      }
    }

    // Monthly reminder — fires once per month, on the 1st
    if (profile.monthly_reminder_enabled && now.getDate() === 1) {
      const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
      if (log.lastMonthly !== monthKey) {
        fireNotification('Time for your monthly assessment', 'Retake your DiabFit screening to track your Body Age progress.');
        log.lastMonthly = monthKey;
      }
    }

    setReminderLog(log);
  }

  function getISOWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${weekNo}`;
  }

  return { requestPermission, checkAndFireDue };
})();
