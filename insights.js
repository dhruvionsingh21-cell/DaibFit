/**
 * journey/insights.js
 * ─────────────────────────────────────────────────────────────
 * Generates personal insights using plain JavaScript comparison
 * rules — NOT AI. Every insight here is a deterministic comparison
 * between two time windows (this week vs last week, etc).
 * AI is reserved exclusively for the "Ask AI" coach in ai-coach.js.
 * ─────────────────────────────────────────────────────────────
 */

const DFInsights = (function () {

  /** Split a log array into two consecutive week-long windows for comparison. */
  function splitIntoWeeks(logs) {
    const now = new Date();
    const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 6);
    const lastWeekStart = new Date(now); lastWeekStart.setDate(now.getDate() - 13);
    const lastWeekEnd = new Date(now); lastWeekEnd.setDate(now.getDate() - 7);

    const thisWeek = logs.filter(l => new Date(l.log_date) >= thisWeekStart);
    const lastWeek = logs.filter(l => {
      const d = new Date(l.log_date);
      return d >= lastWeekStart && d <= lastWeekEnd;
    });
    return { thisWeek, lastWeek };
  }

  function avg(arr, key) {
    const vals = arr.map(l => l[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
  }

  function pctChange(newVal, oldVal) {
    if (oldVal === null || oldVal === 0 || oldVal === undefined) return null;
    return Math.round(((newVal - oldVal) / oldVal) * 100);
  }

  /**
   * Main entry point. Returns an array of { type, icon, text, positive } insight objects.
   * type: 'walk' | 'sleep' | 'weight' | 'consistency' | 'sugar' | 'streak'
   * positive: true = good news styling, false = needs-attention styling
   */
  function generateInsights(logs, streak) {
    const insights = [];
    if (!logs || logs.length < 3) {
      insights.push({
        type: 'info', icon: '📊', positive: null,
        text: 'Keep logging daily — insights appear once you have at least a week of data.',
      });
      return insights;
    }

    const { thisWeek, lastWeek } = splitIntoWeeks(logs);

    // ── Walking trend ──────────────────────────────────────────
    const walkThis = avg(thisWeek, 'walk_minutes');
    const walkLast = avg(lastWeek, 'walk_minutes');
    if (walkThis !== null && walkLast !== null && walkLast > 0) {
      const change = pctChange(walkThis, walkLast);
      if (change !== null && Math.abs(change) >= 10) {
        insights.push({
          type: 'walk', icon: change > 0 ? '📈' : '📉', positive: change > 0,
          text: change > 0
            ? `Your walking increased by ${change}% this week — keep the momentum.`
            : `Your walking dropped by ${Math.abs(change)}% this week compared to last.`,
        });
      }
    }

    // ── Sleep trend ────────────────────────────────────────────
    const sleepThis = avg(thisWeek, 'sleep_hours');
    const sleepLast = avg(lastWeek, 'sleep_hours');
    if (sleepThis !== null && sleepLast !== null) {
      const diff = +(sleepThis - sleepLast).toFixed(1);
      if (Math.abs(diff) >= 0.5) {
        insights.push({
          type: 'sleep', icon: diff > 0 ? '😴' : '⚠️', positive: diff > 0,
          text: diff > 0
            ? `Sleep is improving — up ${diff}h/night on average this week.`
            : `Sleep is decreasing — down ${Math.abs(diff)}h/night compared to last week.`,
        });
      }
    }

    // ── Weight trend ───────────────────────────────────────────
    const weighedThis = thisWeek.filter(l => l.weight_kg).map(l => l.weight_kg);
    const weighedAll = logs.filter(l => l.weight_kg).map(l => ({ date: l.log_date, w: l.weight_kg }));
    if (weighedAll.length >= 2) {
      const first = weighedAll[0].w;
      const latest = weighedAll[weighedAll.length - 1].w;
      const diff = +(latest - first).toFixed(1);
      if (Math.abs(diff) >= 0.5) {
        insights.push({
          type: 'weight', icon: diff < 0 ? '⚖️' : '📊', positive: diff < 0,
          text: diff < 0
            ? `Weight reduced by ${Math.abs(diff)} kg since you started tracking.`
            : `Weight increased by ${diff} kg since you started tracking.`,
        });
      }
    }

    // ── Sugar control trend ────────────────────────────────────
    const sugarThis = avg(thisWeek, 'sugar_control');
    const sugarLast = avg(lastWeek, 'sugar_control');
    if (sugarThis !== null && sugarLast !== null) {
      const diff = +(sugarThis - sugarLast).toFixed(1);
      if (diff >= 0.4) {
        insights.push({
          type: 'sugar', icon: '🍬', positive: true,
          text: `You're controlling sugar intake better this week than last.`,
        });
      } else if (diff <= -0.4) {
        insights.push({
          type: 'sugar', icon: '🍬', positive: false,
          text: `Sugar control slipped a bit this week — worth a look.`,
        });
      }
    }

    // ── Consistency trend (days logged) ────────────────────────
    const consistencyThis = thisWeek.length;
    const consistencyLast = lastWeek.length;
    if (consistencyLast > 0) {
      if (consistencyThis > consistencyLast) {
        insights.push({
          type: 'consistency', icon: '✅', positive: true,
          text: `Your consistency is improving — ${consistencyThis}/7 days logged this week vs ${consistencyLast}/7 last week.`,
        });
      } else if (consistencyThis < consistencyLast) {
        insights.push({
          type: 'consistency', icon: '📉', positive: false,
          text: `Fewer check-ins this week (${consistencyThis}/7) than last (${consistencyLast}/7). Try to log daily.`,
        });
      }
    } else if (consistencyThis >= 5) {
      insights.push({
        type: 'consistency', icon: '✅', positive: true,
        text: `Great start — ${consistencyThis}/7 days logged this week.`,
      });
    }

    // ── Streak callout ─────────────────────────────────────────
    if (streak >= 7) {
      insights.push({
        type: 'streak', icon: '🔥', positive: true,
        text: `You're on a ${streak}-day streak. Consistency compounds — don't break it now.`,
      });
    }

    // Fallback if nothing triggered
    if (insights.length === 0) {
      insights.push({
        type: 'info', icon: '👍', positive: true,
        text: 'Your habits are holding steady — keep logging to unlock more personalised insights.',
      });
    }

    return insights;
  }

  /** Computes a 0-100 consistency score for a given set of logs over N expected days. */
  function computeConsistencyScore(logs, expectedDays) {
    if (!expectedDays) return 0;
    const loggedDays = logs.length;
    const completenessScore = Math.min(100, Math.round((loggedDays / expectedDays) * 100));
    return completenessScore;
  }

  /** Total distance walked in km, estimated at ~5 km/h average walking pace. */
  function estimateKmWalked(logs) {
    const totalMinutes = logs.reduce((sum, l) => sum + (l.walk_minutes || 0), 0);
    return +(totalMinutes / 60 * 5).toFixed(1);
  }

  return { generateInsights, computeConsistencyScore, estimateKmWalked, splitIntoWeeks, avg, pctChange };
})();
