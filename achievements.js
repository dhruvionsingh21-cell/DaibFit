/**
 * journey/achievements.js
 * ─────────────────────────────────────────────────────────────
 * Defines all achievement badges and the logic to check whether
 * a user has newly earned one, based on their logs and streak.
 * ─────────────────────────────────────────────────────────────
 */

const DFAchievements = (function () {

  const DEFINITIONS = {
    streak_7:       { icon: '🔥', name: '7 Day Streak',    desc: 'Logged your habits 7 days in a row' },
    streak_30:      { icon: '🔥', name: '30 Day Streak',   desc: 'Logged your habits 30 days in a row' },
    streak_90:      { icon: '🏆', name: '90 Day Streak',   desc: 'Logged your habits 90 days in a row' },
    walk_100km:     { icon: '🚶', name: '100 km Walked',   desc: 'Walked a cumulative 100 km' },
    weight_loss_5kg:{ icon: '⚖️', name: '5 kg Lost',       desc: 'Reduced your weight by 5 kg since starting' },
  };

  /**
   * Checks current stats against thresholds and returns a list of
   * achievement keys newly earned (not yet unlocked in the database).
   */
  function checkNewAchievements({ streak, logs, alreadyUnlockedKeys }) {
    const earned = [];
    const has = k => alreadyUnlockedKeys.includes(k);

    if (streak >= 7 && !has('streak_7')) earned.push('streak_7');
    if (streak >= 30 && !has('streak_30')) earned.push('streak_30');
    if (streak >= 90 && !has('streak_90')) earned.push('streak_90');

    const kmWalked = DFInsights.estimateKmWalked(logs);
    if (kmWalked >= 100 && !has('walk_100km')) earned.push('walk_100km');

    const weighed = logs.filter(l => l.weight_kg).map(l => l.weight_kg);
    if (weighed.length >= 2) {
      const lost = weighed[0] - weighed[weighed.length - 1];
      if (lost >= 5 && !has('weight_loss_5kg')) earned.push('weight_loss_5kg');
    }

    return earned;
  }

  function getDefinition(key) {
    return DEFINITIONS[key] || { icon: '🏅', name: key, desc: '' };
  }

  function getAllDefinitions() {
    return DEFINITIONS;
  }

  return { checkNewAchievements, getDefinition, getAllDefinitions };
})();
