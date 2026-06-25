(function () {
  const WINDOW_MS = 30 * 60 * 1000;
  const SAMPLE_INTERVAL_MS = 30 * 1000;
  const MOTION_PROBE_MS = 1500;
  const PEAK_RATIO = 1.4;
  const PEAK_MIN_MAGNITUDE = 10.5;

  const screenHome = document.getElementById('screen-home');
  const screenAlarm = document.getElementById('screen-alarm');
  const cardAlarm = document.getElementById('card-alarm');
  const backBtn = document.getElementById('back-alarm');

  const selectView = document.getElementById('alarm-select-view');
  const activeView = document.getElementById('alarm-active-view');
  const timeInput = document.getElementById('alarm-time');
  const smartToggle = document.getElementById('smart-mode-toggle');
  const smartSwitch = smartToggle.querySelector('.toggle-switch');
  const warningText = document.getElementById('smart-mode-warning');
  const activateBtn = document.getElementById('activate-alarm');
  const cancelBtn = document.getElementById('cancel-alarm');
  const targetDisplay = document.getElementById('alarm-target-display');
  const statusText = activeView.querySelector('.alarm-status-text');
  const modeNote = document.getElementById('alarm-mode-note');

  let smartModeOn = true;
  let targetTime = null;
  let windowStart = null;
  let alarmTriggered = false;

  let latestMagnitude = 0;
  let motionLog = [];
  let sampleIntervalId = null;
  let deadlineTimeoutId = null;
  let motionHandlerRef = null;
  let alarmAudio = null;
  let alarmSweepIntervalId = null;

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

  function formatHM(date) {
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function computeTargetTime(hhmm) {
    const parts = hhmm.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  function setSmartMode(on) {
    smartModeOn = on;
    smartSwitch.classList.toggle('on', on);
    smartToggle.setAttribute('aria-checked', String(on));
    warningText.classList.add('hidden');
  }

  function handleDeviceMotion(event) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x === null) return;
    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;
    latestMagnitude = Math.sqrt(x * x + y * y + z * z);
  }

  function probeMotionAvailability() {
    return new Promise(function (resolve) {
      if (!('DeviceMotionEvent' in window)) {
        resolve(false);
        return;
      }

      function finishProbe(available) {
        window.removeEventListener('devicemotion', probeHandler);
        resolve(available);
      }

      let gotEvent = false;
      function probeHandler(event) {
        const acc = event.accelerationIncludingGravity || event.acceleration;
        if (acc && acc.x !== null) {
          gotEvent = true;
        }
      }

      window.addEventListener('devicemotion', probeHandler);
      setTimeout(function () {
        finishProbe(gotEvent);
      }, MOTION_PROBE_MS);

      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(function (state) {
            if (state !== 'granted') {
              finishProbe(false);
            }
          })
          .catch(function () {
            finishProbe(false);
          });
      }
    });
  }

  function sampleMotion() {
    motionLog.push({ t: Date.now(), mag: latestMagnitude });
    checkSmartWindow();
  }

  function checkSmartWindow() {
    if (alarmTriggered) return;
    const now = Date.now();

    if (now >= windowStart.getTime()) {
      const samples = motionLog.filter(function (s) {
        return s.t >= windowStart.getTime();
      });
      if (samples.length >= 3) {
        const mags = samples.map(function (s) { return s.mag; });
        const current = mags[mags.length - 1];
        const baseline = mags.slice(0, -1).reduce(function (a, b) { return a + b; }, 0) / (mags.length - 1);
        if (current > baseline * PEAK_RATIO && current > PEAK_MIN_MAGNITUDE) {
          triggerAlarm('Terdeteksi gerakan — fase tidur ringan');
          return;
        }
      }
    }

    if (now >= targetTime.getTime()) {
      triggerAlarm('Waktu target tercapai');
    }
  }

  function clearSchedule() {
    if (sampleIntervalId) {
      clearInterval(sampleIntervalId);
      sampleIntervalId = null;
    }
    if (deadlineTimeoutId) {
      clearTimeout(deadlineTimeoutId);
      deadlineTimeoutId = null;
    }
    if (motionHandlerRef) {
      window.removeEventListener('devicemotion', motionHandlerRef);
      motionHandlerRef = null;
    }
  }

  function startGentleAlarmSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 220;

    const tremolo = ctx.createGain();
    tremolo.gain.value = 1;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(tremolo.gain);

    osc.connect(tremolo).connect(master);

    const now = ctx.currentTime;
    master.gain.linearRampToValueAtTime(0.35, now + 6);

    function scheduleSweep(startTime) {
      osc.frequency.setValueAtTime(220, startTime);
      osc.frequency.linearRampToValueAtTime(440, startTime + 10);
      osc.frequency.linearRampToValueAtTime(220, startTime + 20);
    }
    scheduleSweep(now);

    osc.start(now);
    lfo.start(now);

    alarmSweepIntervalId = setInterval(function () {
      scheduleSweep(ctx.currentTime);
    }, 20000);

    alarmAudio = { ctx: ctx, osc: osc, lfo: lfo };
  }

  function stopGentleAlarmSound() {
    if (alarmSweepIntervalId) {
      clearInterval(alarmSweepIntervalId);
      alarmSweepIntervalId = null;
    }
    if (alarmAudio) {
      try {
        alarmAudio.osc.stop();
        alarmAudio.lfo.stop();
      } catch (e) {
        /* nodes may already be stopped */
      }
      alarmAudio.ctx.close();
      alarmAudio = null;
    }
  }

  function triggerAlarm(reason) {
    alarmTriggered = true;
    clearSchedule();
    statusText.textContent = 'Alarm berbunyi — waktunya bangun! ⏰';
    modeNote.textContent = reason;
    startGentleAlarmSound();
  }

  function startNormalSchedule() {
    const ms = targetTime.getTime() - Date.now();
    deadlineTimeoutId = setTimeout(function () {
      triggerAlarm('Waktu target tercapai');
    }, ms);
  }

  function startSmartSchedule() {
    motionLog = [];
    latestMagnitude = 0;
    motionHandlerRef = handleDeviceMotion;
    window.addEventListener('devicemotion', motionHandlerRef);
    sampleIntervalId = setInterval(sampleMotion, SAMPLE_INTERVAL_MS);
    deadlineTimeoutId = setTimeout(function () {
      triggerAlarm('Waktu target tercapai');
    }, targetTime.getTime() - Date.now());
  }

  function activateAlarm() {
    alarmTriggered = false;
    targetTime = computeTargetTime(timeInput.value || '06:00');
    windowStart = new Date(targetTime.getTime() - WINDOW_MS);

    targetDisplay.textContent = formatHM(targetTime);
    statusText.textContent = 'Alarm aktif — selamat tidur 🌙';
    warningText.classList.add('hidden');

    if (smartModeOn) {
      probeMotionAvailability().then(function (available) {
        if (available) {
          modeNote.textContent = 'Mode: Smart — memantau gerakan tidurmu';
          startSmartSchedule();
        } else {
          warningText.classList.remove('hidden');
          modeNote.textContent = 'Mode: Alarm biasa (sensor tidak tersedia)';
          startNormalSchedule();
        }
      });
    } else {
      modeNote.textContent = 'Mode: Alarm biasa';
      startNormalSchedule();
    }

    selectView.classList.add('hidden');
    activeView.classList.remove('hidden');
  }

  function cancelAlarm() {
    clearSchedule();
    stopGentleAlarmSound();
    alarmTriggered = false;
    activeView.classList.add('hidden');
    selectView.classList.remove('hidden');
  }

  activateClick(cardAlarm, function () {
    showScreen(screenAlarm);
  });

  activateClick(backBtn, function () {
    cancelAlarm();
    showScreen(screenHome);
  });

  activateClick(smartToggle, function () {
    setSmartMode(!smartModeOn);
  });

  activateClick(activateBtn, function () {
    activateAlarm();
  });

  activateClick(cancelBtn, function () {
    cancelAlarm();
  });

  setSmartMode(true);
})();
