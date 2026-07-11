/**
 * journey/charts.js
 * ─────────────────────────────────────────────────────────────
 * Renders weekly and monthly progress charts using Chart.js
 * (loaded via CDN in tracker.html). Keeps chart config in one
 * place so styling stays consistent across the dashboard.
 * ─────────────────────────────────────────────────────────────
 */

const DFCharts = (function () {
  let weeklyChartInstance = null;
  let monthlyChartInstance = null;

  const COLORS = {
    walk: '#378ADD',
    sleep: '#7F77DD',
    grid: 'rgba(150,150,150,0.15)',
    text: '#888',
  };

  function destroyIfExists(instance) {
    if (instance) instance.destroy();
  }

  /**
   * Renders a 7-day bar chart of walk minutes with a sleep line overlay.
   * @param {HTMLCanvasElement} canvas
   * @param {Array} logs - last 7 days of daily_logs rows, oldest first
   */
  function renderWeeklyChart(canvas, logs) {
    destroyIfExists(weeklyChartInstance);
    const labels = logs.map(l => new Date(l.log_date).toLocaleDateString('en-IN', { weekday: 'short' }));
    const walkData = logs.map(l => l.walk_minutes || 0);
    const sleepData = logs.map(l => l.sleep_hours || null);

    weeklyChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Walk (min)', data: walkData, backgroundColor: COLORS.walk,
            borderRadius: 6, yAxisID: 'y', order: 2,
          },
          {
            label: 'Sleep (hrs)', data: sleepData, type: 'line', borderColor: COLORS.sleep,
            backgroundColor: COLORS.sleep, tension: 0.35, yAxisID: 'y1', order: 1,
            pointRadius: 3, pointBackgroundColor: COLORS.sleep,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: 'min', font: { size: 10 } }, grid: { color: COLORS.grid } },
          y1: { beginAtZero: true, position: 'right', max: 12, title: { display: true, text: 'hrs', font: { size: 10 } }, grid: { display: false } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /**
   * Renders a monthly trend line chart (consistency score over recent weeks).
   * @param {HTMLCanvasElement} canvas
   * @param {Array} weeklyReports - array of weekly_reports rows, oldest first
   */
  function renderMonthlyChart(canvas, weeklyReports) {
    destroyIfExists(monthlyChartInstance);
    const labels = weeklyReports.map(r => {
      const d = new Date(r.week_start);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    });
    const scores = weeklyReports.map(r => r.consistency_score || 0);

    monthlyChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Consistency score', data: scores, borderColor: '#1D9E75',
          backgroundColor: 'rgba(29,158,117,0.1)', fill: true, tension: 0.3,
          pointRadius: 4, pointBackgroundColor: '#1D9E75',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: COLORS.grid } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  return { renderWeeklyChart, renderMonthlyChart };
})();
