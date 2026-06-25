(function () {
  const STORAGE_KEY = 'lucid-mood';
  const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const screenHome = document.getElementById('screen-home');
  const screenMood = document.getElementById('screen-mood');
  const cardMood = document.getElementById('card-mood');
  const backBtn = document.getElementById('back-mood');

  const emojiCards = document.querySelectorAll('.mood-emoji-card');
  const confirmEl = document.getElementById('mood-confirm');
  const emptyEl = document.getElementById('mood-empty');
  const chartWrap = document.getElementById('mood-chart-wrap');
  const chartEl = document.getElementById('mood-chart');
  const avgEl = document.getElementById('mood-average');
  const trendEl = document.getElementById('mood-trend');

  function activateClick(el, handler) {
    el.addEventListener('click', handler);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  }

  function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function dayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return DAY_NAMES[d.getDay()];
  }

  function loadData() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getLast7(data) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 6);

    return data
      .filter(function (entry) {
        const d = new Date(entry.date + 'T00:00:00');
        return d >= cutoff && d <= today;
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });
  }

  function scoreColor(score) {
    const hue = ((score - 1) / 4) * 120;
    return 'hsl(' + hue + ', 70%, 55%)';
  }

  function average(entries) {
    if (!entries.length) return 0;
    const sum = entries.reduce(function (acc, e) { return acc + e.score; }, 0);
    return sum / entries.length;
  }

  function computeTrend(entries) {
    if (entries.length < 4) return 'Stabil ➡️';
    const last3 = entries.slice(-3);
    const prev3 = entries.slice(0, -3).slice(-3);
    if (!prev3.length) return 'Stabil ➡️';

    const diff = average(last3) - average(prev3);
    if (diff > 0.3) return 'Membaik 📈';
    if (diff < -0.3) return 'Menurun 📉';
    return 'Stabil ➡️';
  }

  function renderChart(entries) {
    chartEl.innerHTML = '';
    entries.forEach(function (entry) {
      const col = document.createElement('div');
      col.className = 'mood-bar-col';

      const value = document.createElement('span');
      value.className = 'mood-bar-value';
      value.textContent = String(entry.score);

      const track = document.createElement('div');
      track.className = 'mood-bar-track';

      const bar = document.createElement('div');
      bar.className = 'mood-bar';
      bar.style.height = (entry.score / 5) * 100 + '%';
      bar.style.background = scoreColor(entry.score);
      track.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'mood-bar-label';
      label.textContent = dayLabel(entry.date);

      col.appendChild(value);
      col.appendChild(track);
      col.appendChild(label);
      chartEl.appendChild(col);
    });
  }

  function updateEmojiHighlight(data) {
    const todayEntry = data.find(function (e) { return e.date === todayStr(); });
    emojiCards.forEach(function (card) {
      const isActive = !!todayEntry && Number(card.dataset.score) === todayEntry.score;
      card.classList.toggle('active', isActive);
    });
    confirmEl.classList.toggle('hidden', !todayEntry);
  }

  function render() {
    const data = loadData();
    updateEmojiHighlight(data);

    const last7 = getLast7(data);
    if (!last7.length) {
      emptyEl.classList.remove('hidden');
      chartWrap.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    chartWrap.classList.remove('hidden');
    renderChart(last7);

    avgEl.textContent = 'Rata-rata: ' + average(last7).toFixed(1) + ' / 5';
    trendEl.textContent = computeTrend(last7);
  }

  function selectMood(score) {
    const data = loadData();
    const today = todayStr();
    const idx = data.findIndex(function (e) { return e.date === today; });

    if (idx >= 0) {
      data[idx].score = score;
    } else {
      data.push({ date: today, score: score, sleepTime: null, wakeTime: null });
    }

    saveData(data);
    render();
  }

  activateClick(cardMood, function () {
    showScreen(screenMood);
    render();
  });

  activateClick(backBtn, function () {
    showScreen(screenHome);
  });

  emojiCards.forEach(function (card) {
    activateClick(card, function () {
      selectMood(Number(card.dataset.score));
    });
  });

  render();
})();
