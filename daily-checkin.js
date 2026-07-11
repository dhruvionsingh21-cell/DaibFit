/**
 * journey/daily-checkin.js
 * ─────────────────────────────────────────────────────────────
 * Renders and handles the daily check-in form. Every field uses
 * sliders, toggle buttons, or dropdowns — no typing required,
 * except the optional weight field which uses a stepper.
 * Designed to be completable in under 60 seconds.
 * ─────────────────────────────────────────────────────────────
 */

const DFCheckin = (function () {
  let pendingLog = {}; // accumulates today's values before saving

  const VEGGIE_OPTIONS = [
    { val: 0, label: 'None' }, { val: 1, label: '1 serving' },
    { val: 2, label: '2 servings' }, { val: 3, label: 'Every meal' },
  ];
  const SUGAR_OPTIONS = [
    { val: 0, label: 'No change' }, { val: 1, label: 'Reduced' }, { val: 2, label: 'Avoided' },
  ];
  const MOOD_OPTIONS = [
    { val: 'great', emoji: '😄' }, { val: 'good', emoji: '🙂' }, { val: 'okay', emoji: '😐' },
    { val: 'tired', emoji: '😴' }, { val: 'stressed', emoji: '😓' },
  ];

  /** Renders the check-in form into the given container, pre-filled from an existing log if present. */
  function render(container, existingLog) {
    pendingLog = existingLog ? { ...existingLog } : {};

    container.innerHTML = `
      <div class="df-checkin-field">
        <label>🚶 Activity today <span class="df-val" id="cf-walk-val">${pendingLog.walk_minutes || 0} min</span></label>
        <input type="range" id="cf-walk" min="0" max="90" step="5" value="${pendingLog.walk_minutes || 0}">
      </div>

      <div class="df-checkin-field">
        <label>💧 Water <span class="df-val" id="cf-water-val">${pendingLog.water_glasses || 0} glasses</span></label>
        <input type="range" id="cf-water" min="0" max="12" step="1" value="${pendingLog.water_glasses || 0}">
      </div>

      <div class="df-checkin-field">
        <label>🥗 Vegetables today</label>
        <div class="df-toggle-row" id="cf-veggies">
          ${VEGGIE_OPTIONS.map(o => `<button type="button" class="df-toggle-btn${pendingLog.veggie_servings === o.val ? ' active' : ''}" data-val="${o.val}">${o.label}</button>`).join('')}
        </div>
      </div>

      <div class="df-checkin-field">
        <label>🍬 Sugar control</label>
        <div class="df-toggle-row" id="cf-sugar">
          ${SUGAR_OPTIONS.map(o => `<button type="button" class="df-toggle-btn${pendingLog.sugar_control === o.val ? ' active' : ''}" data-val="${o.val}">${o.label}</button>`).join('')}
        </div>
      </div>

      <div class="df-checkin-field">
        <label>😴 Sleep last night <span class="df-val" id="cf-sleep-val">${pendingLog.sleep_hours || 7} hrs</span></label>
        <input type="range" id="cf-sleep" min="4" max="10" step="0.5" value="${pendingLog.sleep_hours || 7}">
      </div>

      <div class="df-checkin-field">
        <label>⚖️ Weight (optional)</label>
        <div class="df-stepper">
          <button type="button" id="cf-weight-minus" class="df-stepper-btn">−</button>
          <span id="cf-weight-val">${pendingLog.weight_kg || '—'}</span>
          <button type="button" id="cf-weight-plus" class="df-stepper-btn">+</button>
        </div>
      </div>

      <div class="df-checkin-field df-checkin-row">
        <label style="margin:0">💊 Medication / vitamins taken</label>
        <button type="button" id="cf-meds" class="df-switch${pendingLog.medication_taken ? ' on' : ''}"></button>
      </div>

      <div class="df-checkin-field df-checkin-row">
        <label style="margin:0">🧘 Did a stress-relief activity</label>
        <button type="button" id="cf-stress" class="df-switch${pendingLog.stress_relief_done ? ' on' : ''}"></button>
      </div>

      <div class="df-checkin-field">
        <label>Mood today</label>
        <div class="df-toggle-row" id="cf-mood">
          ${MOOD_OPTIONS.map(o => `<button type="button" class="df-emoji-btn${pendingLog.mood === o.val ? ' active' : ''}" data-val="${o.val}">${o.emoji}</button>`).join('')}
        </div>
      </div>

      <button id="cf-save-btn" class="df-save-btn">✓ Save today's check-in</button>
    `;

    wireEvents(container);
  }

  function wireEvents(container) {
    const walkSlider = container.querySelector('#cf-walk');
    walkSlider.oninput = () => {
      pendingLog.walk_minutes = parseInt(walkSlider.value);
      container.querySelector('#cf-walk-val').textContent = `${walkSlider.value} min`;
    };

    const waterSlider = container.querySelector('#cf-water');
    waterSlider.oninput = () => {
      pendingLog.water_glasses = parseInt(waterSlider.value);
      container.querySelector('#cf-water-val').textContent = `${waterSlider.value} glasses`;
    };

    const sleepSlider = container.querySelector('#cf-sleep');
    sleepSlider.oninput = () => {
      pendingLog.sleep_hours = parseFloat(sleepSlider.value);
      container.querySelector('#cf-sleep-val').textContent = `${sleepSlider.value} hrs`;
    };

    wireToggleGroup(container, '#cf-veggies', val => pendingLog.veggie_servings = parseInt(val));
    wireToggleGroup(container, '#cf-sugar', val => pendingLog.sugar_control = parseInt(val));
    wireToggleGroup(container, '#cf-mood', val => pendingLog.mood = val);

    let weight = pendingLog.weight_kg || 0;
    const weightVal = container.querySelector('#cf-weight-val');
    container.querySelector('#cf-weight-minus').onclick = () => {
      weight = Math.max(30, (weight || 60) - 0.5);
      pendingLog.weight_kg = weight;
      weightVal.textContent = weight.toFixed(1);
    };
    container.querySelector('#cf-weight-plus').onclick = () => {
      weight = Math.min(200, (weight || 60) + 0.5);
      pendingLog.weight_kg = weight;
      weightVal.textContent = weight.toFixed(1);
    };

    const medsBtn = container.querySelector('#cf-meds');
    medsBtn.onclick = () => {
      pendingLog.medication_taken = !pendingLog.medication_taken;
      medsBtn.classList.toggle('on', pendingLog.medication_taken);
    };

    const stressBtn = container.querySelector('#cf-stress');
    stressBtn.onclick = () => {
      pendingLog.stress_relief_done = !pendingLog.stress_relief_done;
      stressBtn.classList.toggle('on', pendingLog.stress_relief_done);
    };

    container.querySelector('#cf-save-btn').onclick = () => saveLog(container);
  }

  function wireToggleGroup(container, selector, onSelect) {
    const group = container.querySelector(selector);
    group.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.val);
      };
    });
  }

  async function saveLog(container) {
    const btn = container.querySelector('#cf-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const dateStr = DFApi.todayStr();
    const saved = await DFApi.upsertDailyLog(dateStr, pendingLog);
    if (saved) {
      btn.textContent = '✓ Saved!';
      document.dispatchEvent(new CustomEvent('df-log-saved', { detail: { log: saved } }));
      setTimeout(() => { btn.disabled = false; btn.textContent = "✓ Save today's check-in"; }, 1500);
    } else {
      btn.textContent = 'Error — try again';
      btn.disabled = false;
    }
  }

  return { render };
})();
