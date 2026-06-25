(function () {
  const DURATIONS = [15, 20, 30];
  const TARGET_VOLUME = 0.5;
  const FADE_SECONDS = 5 * 60;

  const screenHome = document.getElementById('screen-home');
  const screenSoundscape = document.getElementById('screen-soundscape');
  const cardSoundscape = document.getElementById('card-soundscape');
  const backBtn = document.getElementById('back-soundscape');

  const soundCards = document.querySelectorAll('.sound-card');
  const durationSlider = document.getElementById('duration-slider');
  const durationValue = document.getElementById('duration-value');
  const startBtn = document.getElementById('start-session');
  const stopBtn = document.getElementById('stop-session');

  const selectView = document.getElementById('select-view');
  const sessionView = document.getElementById('session-view');
  const timerDisplay = document.getElementById('timer-display');

  let selectedSound = 'rain';
  let selectedDuration = DURATIONS[1];
  let audioState = null;
  let countdownId = null;
  let sessionEndAt = 0;

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

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function selectSound(type) {
    selectedSound = type;
    soundCards.forEach(function (card) {
      const isActive = card.dataset.sound === type;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });
  }

  function createNoiseBuffer(ctx, seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function buildSoundGraph(ctx, type) {
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, 4);
    source.loop = true;

    const oscillators = [];
    let output = source;

    if (type === 'rain') {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 700;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 7000;

      const flutter = ctx.createGain();
      flutter.gain.value = 1;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain).connect(flutter.gain);
      lfo.start();

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(flutter);
      output = flutter;
      oscillators.push(lfo);
    } else if (type === 'ocean') {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;

      const swell = ctx.createGain();
      swell.gain.value = 0.7;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(swell.gain);
      lfo.start();

      source.connect(lowpass);
      lowpass.connect(swell);
      output = swell;
      oscillators.push(lfo);
    } else {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 400;

      const hum = ctx.createBiquadFilter();
      hum.type = 'peaking';
      hum.frequency.value = 180;
      hum.Q.value = 0.7;
      hum.gain.value = 4;

      const drift = ctx.createGain();
      drift.gain.value = 0.9;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.1;
      lfo.connect(lfoGain).connect(drift.gain);
      lfo.start();

      source.connect(lowpass);
      lowpass.connect(hum);
      hum.connect(drift);
      output = drift;
      oscillators.push(lfo);
    }

    source.start();
    return { source: source, output: output, oscillators: oscillators };
  }

  function startSession() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    const graph = buildSoundGraph(ctx, selectedSound);
    graph.output.connect(masterGain);

    const totalSeconds = selectedDuration * 60;
    const now = ctx.currentTime;
    const fadeStart = Math.max(0, totalSeconds - FADE_SECONDS);

    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(TARGET_VOLUME, now + 2);
    masterGain.gain.setValueAtTime(TARGET_VOLUME, now + fadeStart);
    masterGain.gain.linearRampToValueAtTime(0, now + totalSeconds);

    audioState = { ctx: ctx, masterGain: masterGain, source: graph.source, oscillators: graph.oscillators };

    selectView.classList.add('hidden');
    sessionView.classList.remove('hidden');

    sessionEndAt = Date.now() + totalSeconds * 1000;
    updateCountdown();
    countdownId = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    const remaining = Math.round((sessionEndAt - Date.now()) / 1000);
    if (remaining <= 0) {
      timerDisplay.textContent = '00:00';
      endSession();
      return;
    }
    timerDisplay.textContent = formatTime(remaining);
  }

  function stopAudio() {
    if (!audioState) return;
    try {
      audioState.oscillators.forEach(function (osc) {
        osc.stop();
      });
      audioState.source.stop();
    } catch (e) {
      /* nodes may already be stopped */
    }
    audioState.ctx.close();
    audioState = null;
  }

  function endSession() {
    if (countdownId) {
      clearInterval(countdownId);
      countdownId = null;
    }
    stopAudio();
    sessionView.classList.add('hidden');
    selectView.classList.remove('hidden');
    timerDisplay.textContent = formatTime(selectedDuration * 60);
  }

  activateClick(cardSoundscape, function () {
    showScreen(screenSoundscape);
  });

  activateClick(backBtn, function () {
    endSession();
    showScreen(screenHome);
  });

  soundCards.forEach(function (card) {
    activateClick(card, function () {
      selectSound(card.dataset.sound);
    });
  });

  durationSlider.addEventListener('input', function () {
    selectedDuration = DURATIONS[Number(durationSlider.value)];
    durationValue.textContent = selectedDuration + ' menit';
    timerDisplay.textContent = formatTime(selectedDuration * 60);
  });

  activateClick(startBtn, function () {
    startSession();
  });

  activateClick(stopBtn, function () {
    endSession();
  });

  selectSound(selectedSound);
  timerDisplay.textContent = formatTime(selectedDuration * 60);
})();
