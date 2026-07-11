/**
 * journey/dashboard.js
 * ─────────────────────────────────────────────────────────────
 * Renders the full dashboard after login: welcome message,
 * today's summary, streak, last assessment, weekly/monthly
 * progress charts, insights, achievements, and research feed.
 * Depends on: api.js, insights.js, charts.js, achievements.js, reports.js
 * ─────────────────────────────────────────────────────────────
 */

const DFDashboard = (function () {

  // Curated static research snippets — refresh this array periodically.
  // Not fetched from an API; hand-picked to keep quality high and avoid AI cost.
  const RESEARCH_FEED = [
    { title: 'Walking 30 min/day cuts diabetes risk by up to 58%', source: 'Diabetes Prevention Program (NIH)' },
    { title: 'South Asians develop diabetes at lower BMI than other populations', source: 'World Health Organization' },
    { title: 'Even 10-minute walks after meals significantly lower blood sugar spikes', source: 'Diabetologia journal' },
    { title: 'Poor sleep is linked to insulin resistance within days', source: 'Annals of Internal Medicine' },
    { title: 'Reducing sugary drink intake is one of the single most effective changes', source: 'ICMR-INDIAB study' },
  ];

  /** Calculates the user's current daily-logging streak (consecutive days including today). */
  function calcStreak(logs) {
    if (!logs.length) return 0;
    const logDates = new Set(logs.map(l => l.log_date));
    let streak = 0;
    let d = new Date();
    while (true) {
      const dateStr = d.toISOString().split('T')[0];
      if (logDates.has(dateStr)) {
        streak++;
      } else if (dateStr !== DFApi.todayStr()) {
        break; // allow today to be unlogged yet without breaking streak
      }
      d.setDate(d.getDate() - 1);
      if (streak > 400) break; // safety cap
    }
    return streak;
  }

  /** Main render entry point — call after auth confirms a logged-in user. */
  async function render(rootEl, lang) {
    const hi = lang === 'hi';
    rootEl.innerHTML = `<div class="df-loading">Loading your journey...</div>`;

    const user = DFAuth.getUser();
    let [profile, logs] = await Promise.all([DFApi.getProfile(), DFApi.getRecentLogs(90)]);

    // If URL carries a fresh assessment (came from index.html result screen), sync it
    const params = new URLSearchParams(window.location.search);
    if (params.get('risk')) {
      profile = await DFApi.syncAssessmentFromParams({
        risk: params.get('risk'), score: params.get('score'),
        bodyAge: params.get('bodyAge'), actualAge: params.get('actualAge'),
      }) || profile;
    }

    const streak = calcStreak(logs);
    window._dfCurrentStreak = streak; // exposed for ai-coach.js context building
    const insights = DFInsights.generateInsights(logs, streak);
    const todayLog = logs.find(l => l.log_date === DFApi.todayStr());

    // Auto-generate/update this week's and this month's report rows (idempotent)
    const weeklyReport = await DFReports.generateAndSaveWeeklyReport(logs, insights);
    await DFReports.generateAndSaveMonthlyReport(logs, insights);
    const weeklyReports = await DFApi.getWeeklyReports(8);

    // Check + unlock achievements
    const existingAchievements = await DFApi.getAchievements();
    const existingKeys = existingAchievements.map(a => a.achievement_key);
    const newlyEarned = DFAchievements.checkNewAchievements({ streak, logs, alreadyUnlockedKeys: existingKeys });
    for (const key of newlyEarned) await DFApi.unlockAchievement(key);
    const allAchievements = newlyEarned.length ? await DFApi.getAchievements() : existingAchievements;

    rootEl.innerHTML = buildHTML({ user, profile, streak, todayLog, insights, weeklyReport, allAchievements, hi });

    // Wire up sub-components after DOM is in place
    DFCheckin.render(document.getElementById('df-checkin-container'), todayLog);
    document.addEventListener('df-log-saved', () => render(rootEl, lang), { once: true });

    if (logs.length) {
      const last7 = logs.slice(-7);
      DFCharts.renderWeeklyChart(document.getElementById('df-weekly-canvas'), last7);
    }
    if (weeklyReports.length) {
      DFCharts.renderMonthlyChart(document.getElementById('df-monthly-canvas'), weeklyReports.reverse());
    }

    wireAchievementsPanel(allAchievements);
    wireAICoach(profile, logs, weeklyReports, insights, lang);
    wireReportDownloads(profile, logs, weeklyReport, hi);
    wireReminderToggles(profile);

    // Fire any due browser reminders (best-effort, requires prior permission grant)
    DFReminders.checkAndFireDue(profile);
  }

  function riskBadge(level) {
    const map = {
      low: { icon: '✅', color: '#085041', bg: '#E1F5EE', label: 'Low risk' },
      moderate: { icon: '⚡', color: '#633806', bg: '#FAEEDA', label: 'Moderate risk' },
      high: { icon: '🔴', color: '#501313', bg: '#FCEBEB', label: 'High risk' },
    };
    return map[level] || { icon: '❔', color: '#888', bg: '#f0f0f0', label: 'Not assessed yet' };
  }

  function buildHTML({ user, profile, streak, todayLog, insights, weeklyReport, allAchievements, hi }) {
    const name = profile?.full_name || user?.user_metadata?.full_name || 'there';
    const firstName = name.split(' ')[0];
    const risk = riskBadge(profile?.last_risk_level);
    const bodyAgeGap = profile?.last_body_age_gap;
    const gapColor = bodyAgeGap > 5 ? '#E24B4A' : bodyAgeGap > 0 ? '#EF9F27' : '#1D9E75';

    return `
      <div class="df-welcome">
        <div>
          <div class="df-welcome-hi">Welcome back,</div>
          <div class="df-welcome-name">${firstName} 👋</div>
        </div>
        ${user?.user_metadata?.avatar_url ? `<img src="${user.user_metadata.avatar_url}" class="df-avatar" alt="">` : ''}
      </div>

      <div class="df-grid-top">
        <div class="df-card df-streak-card">
          <div class="df-card-label">🔥 Current streak</div>
          <div class="df-streak-num">${streak}</div>
          <div class="df-card-sub">day${streak === 1 ? '' : 's'} in a row</div>
        </div>
        <div class="df-card">
          <div class="df-card-label">Today's summary</div>
          ${todayLog ? `
            <div class="df-today-row">🚶 ${todayLog.walk_minutes || 0} min</div>
            <div class="df-today-row">💧 ${todayLog.water_glasses || 0} glasses</div>
            <div class="df-today-row">😴 ${todayLog.sleep_hours || '—'} hrs</div>
          ` : `<div class="df-card-sub">Not logged yet today</div>`}
        </div>
      </div>

      <div class="df-card" style="background:${risk.bg};border-color:${risk.color}30">
        <div class="df-card-label" style="color:${risk.color}">Last assessment</div>
        <div class="df-assess-row">
          <div>
            <div class="df-assess-big" style="color:${risk.color}">${risk.icon} ${risk.label}</div>
            ${profile?.last_risk_score ? `<div class="df-card-sub" style="color:${risk.color}">Score: ${profile.last_risk_score}/26</div>` : ''}
          </div>
          ${profile?.last_body_age ? `
          <div style="text-align:right">
            <div class="df-assess-big" style="color:${gapColor}">${profile.last_body_age} yrs</div>
            <div class="df-card-sub" style="color:${gapColor}">Body age (${bodyAgeGap > 0 ? '+' : ''}${bodyAgeGap}y gap)</div>
          </div>` : ''}
        </div>
        <a href="/" class="df-link-btn">Retake assessment →</a>
      </div>

      <div class="df-card">
        <div class="df-card-label">📝 Today's check-in</div>
        <div id="df-checkin-container"></div>
      </div>

      <div class="df-card">
        <div class="df-card-label">💡 Your personal insights</div>
        <div class="df-insights-list">
          ${insights.map(i => `
            <div class="df-insight-row ${i.positive === true ? 'df-pos' : i.positive === false ? 'df-neg' : ''}">
              <span class="df-insight-icon">${i.icon}</span>
              <span>${i.text}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="df-card">
        <div class="df-card-label">📊 Weekly progress</div>
        <div class="df-chart-wrap"><canvas id="df-weekly-canvas"></canvas></div>
        <button id="df-download-weekly" class="df-secondary-btn">⬇ Download weekly PDF report</button>
      </div>

      <div class="df-card">
        <div class="df-card-label">📈 Monthly progress</div>
        <div class="df-chart-wrap"><canvas id="df-monthly-canvas"></canvas></div>
        <button id="df-download-monthly" class="df-secondary-btn">⬇ Download monthly PDF report</button>
      </div>

      <div class="df-card">
        <div class="df-card-label">🏆 Achievements</div>
        <div id="df-achievements-grid" class="df-achievements-grid"></div>
      </div>

      <div class="df-card df-ai-card">
        <div class="df-card-label">🤖 Ask your Personal Health Coach</div>
        <p class="df-card-sub" style="margin-bottom:.75rem">Get answers based on your actual tracked data — not generic advice.</p>
        <div class="df-ai-suggestions">
          <button class="df-ai-chip" data-q="What should I improve first?">What should I improve first?</button>
          <button class="df-ai-chip" data-q="Why is my Body Age increasing?">Why is my Body Age increasing?</button>
          <button class="df-ai-chip" data-q="What should I eat this week?">What should I eat this week?</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:.75rem">
          <input type="text" id="df-ai-input" placeholder="Ask anything about your health journey..." class="df-ai-input">
          <button id="df-ai-ask-btn" class="df-ai-ask-btn">Ask</button>
        </div>
        <div id="df-ai-answer" class="df-ai-answer" style="display:none"></div>
      </div>

      <div class="df-card">
        <div class="df-card-label">📚 Latest research</div>
        <div class="df-research-list">
          ${RESEARCH_FEED.map(r => `
            <div class="df-research-item">
              <div class="df-research-title">${r.title}</div>
              <div class="df-research-source">${r.source}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="df-card">
        <div class="df-card-label">🔔 Reminders</div>
        <div class="df-reminder-row">
          <span>Daily check-in reminder</span>
          <button id="df-rem-daily" class="df-switch${profile?.daily_reminder_enabled ? ' on' : ''}"></button>
        </div>
        <div class="df-reminder-row">
          <span>Weekly review reminder</span>
          <button id="df-rem-weekly" class="df-switch${profile?.weekly_reminder_enabled ? ' on' : ''}"></button>
        </div>
        <div class="df-reminder-row">
          <span>Monthly assessment reminder</span>
          <button id="df-rem-monthly" class="df-switch${profile?.monthly_reminder_enabled ? ' on' : ''}"></button>
        </div>
        <button id="df-enable-notifs" class="df-secondary-btn" style="margin-top:.5rem">🔔 Enable browser notifications</button>
      </div>
    `;
  }

  function wireAchievementsPanel(achievements) {
    const grid = document.getElementById('df-achievements-grid');
    const allDefs = DFAchievements.getAllDefinitions();
    const unlockedKeys = achievements.map(a => a.achievement_key);
    grid.innerHTML = Object.entries(allDefs).map(([key, def]) => {
      const unlocked = unlockedKeys.includes(key);
      return `<div class="df-badge ${unlocked ? 'df-badge-unlocked' : 'df-badge-locked'}">
        <div class="df-badge-icon">${def.icon}</div>
        <div class="df-badge-name">${def.name}</div>
        <div class="df-badge-desc">${def.desc}</div>
      </div>`;
    }).join('');
  }

  function wireAICoach(profile, logs, weeklyReports, insights, lang) {
    const input = document.getElementById('df-ai-input');
    const btn = document.getElementById('df-ai-ask-btn');
    const answerBox = document.getElementById('df-ai-answer');

    async function ask(question) {
      if (!question || !question.trim()) return;
      answerBox.style.display = 'block';
      answerBox.innerHTML = `<div class="df-ai-loading">Thinking...</div>`;
      btn.disabled = true;
      try {
        const answer = await DFAICoach.ask(question, profile, logs, weeklyReports, insights, lang);
        answerBox.innerHTML = `<div class="df-ai-answer-text">${answer.replace(/\n/g, '<br>')}</div>`;
      } catch (err) {
        answerBox.innerHTML = `<div class="df-ai-error">${err.message}</div>`;
      }
      btn.disabled = false;
    }

    btn.onclick = () => ask(input.value);
    input.onkeydown = (e) => { if (e.key === 'Enter') ask(input.value); };
    document.querySelectorAll('.df-ai-chip').forEach(chip => {
      chip.onclick = () => { input.value = chip.dataset.q; ask(chip.dataset.q); };
    });
  }

  function wireReportDownloads(profile, logs, weeklyReport, hi) {
    const weekBtn = document.getElementById('df-download-weekly');
    const monthBtn = document.getElementById('df-download-monthly');

    weekBtn.onclick = () => {
      const weekStart = DFReports.getWeekStart(new Date());
      const thisWeekLogs = logs.filter(l => l.log_date >= weekStart);
      DFPdfExport.exportWeeklyReport({
        userName: profile?.full_name,
        weekLabel: `Week of ${new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`,
        consistencyScore: weeklyReport?.consistency_score || 0,
        totalWalkMinutes: weeklyReport?.total_walk_minutes || 0,
        totalKm: weeklyReport?.total_km || 0,
        avgSleep: weeklyReport?.avg_sleep_hours,
        insights: DFInsights.generateInsights(logs, window._dfCurrentStreak || 0),
      });
    };

    monthBtn.onclick = async () => {
      const monthReports = await DFApi.getMonthlyReports(1);
      const r = monthReports[0];
      DFPdfExport.exportMonthlyReport({
        userName: profile?.full_name,
        monthLabel: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        consistencyScore: r?.consistency_score || 0,
        totalKm: r?.total_km || 0,
        weightChange: r?.weight_change_kg,
        bodyAge: profile?.last_body_age,
        riskLevel: profile?.last_risk_level,
        insights: DFInsights.generateInsights(logs, window._dfCurrentStreak || 0),
      });
    };
  }

  function wireReminderToggles(profile) {
    const map = {
      'df-rem-daily': 'daily_reminder_enabled',
      'df-rem-weekly': 'weekly_reminder_enabled',
      'df-rem-monthly': 'monthly_reminder_enabled',
    };
    Object.entries(map).forEach(([id, field]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.onclick = async () => {
        const newVal = !btn.classList.contains('on');
        btn.classList.toggle('on', newVal);
        await DFApi.updateProfile({ [field]: newVal });
      };
    });

    const notifBtn = document.getElementById('df-enable-notifs');
    if (notifBtn) {
      notifBtn.onclick = async () => {
        const perm = await DFReminders.requestPermission();
        notifBtn.textContent = perm === 'granted' ? '✓ Notifications enabled' : 'Notifications blocked — enable in browser settings';
      };
    }
  }

  return { render, calcStreak };
})();
