(() => {
  'use strict';

  // ===== CONSTANTS =====
  const STORAGE_KEYS = {
    sessions: 'pomodoro_sessions',
    settings: 'pomodoro_settings',
    mute: 'pomodoro_mute'
  };

  const MODE = {
    focus: 'focus',
    shortBreak: 'shortBreak',
    longBreak: 'longBreak'
  };

  const MODE_LABELS = {
    [MODE.focus]: 'Focus',
    [MODE.shortBreak]: 'Short Break',
    [MODE.longBreak]: 'Long Break'
  };

  const MODE_ICONS = {
    [MODE.focus]: '🎯',
    [MODE.shortBreak]: '☕',
    [MODE.longBreak]: '🌿'
  };

  const DEFAULT_SETTINGS = {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartFocus: false
  };

  // ===== STATE =====
  let settings = loadSettings();
  let isMuted = loadMute();
  let currentMode = MODE.focus;
  let totalSeconds = settings.focusDuration * 60;
  let remainingSeconds = totalSeconds;
  let isRunning = false;
  let timerInterval = null;
  let pomodoroCount = 1; // Which focus session we're on (1-based, within current cycle)
  let audioCtx = null;

  // ===== DOM ELEMENTS =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const elTimerText = $('#timer-text');
  const elTimerModeLabel = $('#timer-mode-label');
  const elPomodoroCounter = $('#pomodoro-counter');
  const elProgressCircle = $('.progress-ring__circle');
  const elStartBtn = $('#start-btn');
  const elPauseBtn = $('#pause-btn');
  const elResetBtn = $('#reset-btn');
  const elMuteBtn = $('#mute-btn');
  const elSpeakerOn = $('#icon-speaker-on');
  const elSpeakerOff = $('#icon-speaker-off');
  const elSettingsBtn = $('#settings-btn');
  const elSettingsPanel = $('#settings-panel');
  const elSessionsBtn = $('#sessions-btn');
  const elSessionsPanel = $('#sessions-panel');
  const elAnnouncement = $('#aria-announcement');

  // Settings inputs
  const elSettingFocus = $('#setting-focus');
  const elSettingShort = $('#setting-short');
  const elSettingLong = $('#setting-long');
  const elSettingInterval = $('#setting-interval');
  const elSettingAutoBreak = $('#setting-autobreak');
  const elSettingAutoFocus = $('#setting-autofocus');

  // Session elements
  const elStatFocusCount = $('#stat-focus-count');
  const elStatFocusMin = $('#stat-focus-min');
  const elStatBreakMin = $('#stat-break-min');
  const elSessionLog = $('#session-log');
  const elClearHistoryBtn = $('#clear-history-btn');
  const elClearConfirm = $('#clear-confirm');
  const elClearYes = $('#clear-yes');
  const elClearNo = $('#clear-no');

  // Progress ring calculation
  const RING_RADIUS = 120;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // ===== PERSISTENCE =====
  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.settings);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }

  function loadMute() {
    try {
      return localStorage.getItem(STORAGE_KEYS.mute) === 'true';
    } catch (e) { return false; }
  }

  function saveMute() {
    localStorage.setItem(STORAGE_KEYS.mute, String(isMuted));
  }

  function loadSessions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return [];
  }

  function saveSessions(sessions) {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }

  // ===== TIMER LOGIC =====
  function getDurationForMode(mode) {
    switch (mode) {
      case MODE.focus: return settings.focusDuration;
      case MODE.shortBreak: return settings.shortBreakDuration;
      case MODE.longBreak: return settings.longBreakDuration;
    }
  }

  function setMode(mode, autoStart) {
    currentMode = mode;
    totalSeconds = getDurationForMode(mode) * 60;
    remainingSeconds = totalSeconds;
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;

    // Update body class for accent colours
    document.body.className = '';
    document.body.classList.add('mode-' + mode);

    // Update tabs
    $$('.mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update labels
    elTimerModeLabel.textContent = MODE_LABELS[mode];
    updatePomodoroCounter();
    updateDisplay();
    updateProgressRing();
    updateButtons();
    updateTitle();

    // Announce mode change
    announce(MODE_LABELS[mode] + ' — ' + formatTime(remainingSeconds));

    // Auto-start if applicable
    if (autoStart) {
      startTimer();
    }
  }

  function startTimer() {
    if (isRunning) return;
    ensureAudioContext();
    isRunning = true;
    updateButtons();

    timerInterval = setInterval(() => {
      remainingSeconds--;

      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        updateDisplay();
        updateProgressRing();
        updateTitle();
        clearInterval(timerInterval);
        timerInterval = null;
        isRunning = false;
        updateButtons();
        onSessionComplete();
        return;
      }

      updateDisplay();
      updateProgressRing();
      updateTitle();
    }, 1000);
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    updateButtons();
  }

  function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = totalSeconds;
    updateDisplay();
    updateProgressRing();
    updateButtons();
    updateTitle();
  }

  function onSessionComplete() {
    // Play sound
    playEndSound(currentMode);

    // Record session
    const sessions = loadSessions();
    sessions.push({
      type: currentMode,
      duration: getDurationForMode(currentMode),
      completedAt: new Date().toISOString()
    });
    saveSessions(sessions);
    updateSessionsUI();

    // Determine next mode
    const wasMode = currentMode;
    if (wasMode === MODE.focus) {
      // Check if time for long break
      if (pomodoroCount >= settings.longBreakInterval) {
        pomodoroCount = 0; // will be reset to 1 after long break
        setMode(MODE.longBreak, settings.autoStartBreaks);
      } else {
        setMode(MODE.shortBreak, settings.autoStartBreaks);
      }
    } else if (wasMode === MODE.shortBreak) {
      pomodoroCount++;
      setMode(MODE.focus, settings.autoStartFocus);
    } else if (wasMode === MODE.longBreak) {
      pomodoroCount = 1;
      setMode(MODE.focus, settings.autoStartFocus);
    }
  }

  // ===== DISPLAY =====
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function updateDisplay() {
    elTimerText.textContent = formatTime(remainingSeconds);
  }

  function updateTitle() {
    document.title = formatTime(remainingSeconds) + ' — ' + MODE_LABELS[currentMode];
  }

  function updateProgressRing() {
    const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    elProgressCircle.style.strokeDasharray = RING_CIRCUMFERENCE;
    elProgressCircle.style.strokeDashoffset = offset;
  }

  function updatePomodoroCounter() {
    elPomodoroCounter.textContent = pomodoroCount + ' / ' + settings.longBreakInterval;
  }

  function updateButtons() {
    if (isRunning) {
      elStartBtn.style.display = 'none';
      elPauseBtn.style.display = '';
    } else {
      elStartBtn.style.display = '';
      elPauseBtn.style.display = 'none';
    }
  }

  function updateMuteUI() {
    if (isMuted) {
      elSpeakerOn.style.display = 'none';
      elSpeakerOff.style.display = '';
    } else {
      elSpeakerOn.style.display = '';
      elSpeakerOff.style.display = 'none';
    }
  }

  function announce(message) {
    elAnnouncement.textContent = '';
    // Force re-announce by clearing then setting
    requestAnimationFrame(() => {
      elAnnouncement.textContent = message;
    });
  }

  // ===== SETTINGS UI =====
  function populateSettingsUI() {
    elSettingFocus.value = settings.focusDuration;
    elSettingShort.value = settings.shortBreakDuration;
    elSettingLong.value = settings.longBreakDuration;
    elSettingInterval.value = settings.longBreakInterval;
    elSettingAutoBreak.checked = settings.autoStartBreaks;
    elSettingAutoFocus.checked = settings.autoStartFocus;
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function onSettingChange() {
    settings.focusDuration = clamp(parseInt(elSettingFocus.value) || 25, 1, 90);
    settings.shortBreakDuration = clamp(parseInt(elSettingShort.value) || 5, 1, 30);
    settings.longBreakDuration = clamp(parseInt(elSettingLong.value) || 15, 1, 60);
    settings.longBreakInterval = clamp(parseInt(elSettingInterval.value) || 4, 2, 8);
    settings.autoStartBreaks = elSettingAutoBreak.checked;
    settings.autoStartFocus = elSettingAutoFocus.checked;

    saveSettings();

    // Apply immediately: reset current timer to new duration
    totalSeconds = getDurationForMode(currentMode) * 60;
    remainingSeconds = totalSeconds;
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;

    updateDisplay();
    updateProgressRing();
    updatePomodoroCounter();
    updateButtons();
    updateTitle();
  }

  // ===== SESSIONS UI =====
  function updateSessionsUI() {
    const sessions = loadSessions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let focusCount = 0;
    let focusMin = 0;
    let breakMin = 0;

    const todaySessions = sessions.filter(s => {
      const d = new Date(s.completedAt);
      return d >= today;
    });

    todaySessions.forEach(s => {
      if (s.type === MODE.focus) {
        focusCount++;
        focusMin += s.duration;
      } else {
        breakMin += s.duration;
      }
    });

    elStatFocusCount.textContent = focusCount;
    elStatFocusMin.textContent = focusMin;
    elStatBreakMin.textContent = breakMin;

    // Show last 20 sessions (most recent first)
    const last20 = sessions.slice(-20).reverse();
    if (last20.length === 0) {
      elSessionLog.innerHTML = '<div class="session-log-empty">No sessions yet. Start your first focus!</div>';
    } else {
      elSessionLog.innerHTML = last20.map(s => {
        const d = new Date(s.completedAt);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const icon = MODE_ICONS[s.type] || '⏱';
        const label = MODE_LABELS[s.type] || s.type;
        return `<div class="session-entry">
          <span class="se-icon">${icon}</span>
          <span class="se-type">${label}</span>
          <span class="se-duration">${s.duration} min</span>
          <span class="se-time">${timeStr}</span>
        </div>`;
      }).join('');
    }
  }

  // ===== SOUND (Web Audio API) =====
  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, startTime, duration, type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playEndSound(mode) {
    if (isMuted) return;
    ensureAudioContext();
    const now = audioCtx.currentTime;

    if (mode === MODE.focus) {
      // Focus end: pleasant 3-tone ascending chime
      playTone(523.25, now, 0.4, 'sine');        // C5
      playTone(659.25, now + 0.2, 0.4, 'sine');  // E5
      playTone(783.99, now + 0.4, 0.6, 'sine');  // G5
    } else {
      // Break end: soft 2-tone descending tone
      playTone(659.25, now, 0.4, 'sine');         // E5
      playTone(523.25, now + 0.25, 0.5, 'sine');  // C5
    }
  }

  // ===== PANEL TOGGLES =====
  function togglePanel(panel, btn) {
    const isOpen = !panel.hidden;
    // Close all panels first
    elSettingsPanel.hidden = true;
    elSessionsPanel.hidden = true;
    elSettingsBtn.classList.remove('active');
    elSessionsBtn.classList.remove('active');

    if (!isOpen) {
      panel.hidden = false;
      btn.classList.add('active');
      if (panel === elSessionsPanel) {
        updateSessionsUI();
      }
    }
    // Hide clear confirm when toggling
    elClearConfirm.hidden = true;
    elClearHistoryBtn.style.display = '';
  }

  // ===== EVENT LISTENERS =====

  // Mode tabs
  $$('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      if (mode !== currentMode) {
        // Reset pomodoro count if manually switching
        if (mode === MODE.focus && (currentMode === MODE.shortBreak || currentMode === MODE.longBreak)) {
          // Keep count as is when returning to focus from break
        }
        setMode(mode, false);
      }
    });
  });

  // Controls
  elStartBtn.addEventListener('click', () => { ensureAudioContext(); startTimer(); });
  elPauseBtn.addEventListener('click', pauseTimer);
  elResetBtn.addEventListener('click', resetTimer);

  // Mute
  elMuteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    saveMute();
    updateMuteUI();
    ensureAudioContext();
  });

  // Settings panel toggle
  elSettingsBtn.addEventListener('click', () => togglePanel(elSettingsPanel, elSettingsBtn));

  // Settings changes
  [elSettingFocus, elSettingShort, elSettingLong, elSettingInterval, elSettingAutoBreak, elSettingAutoFocus]
    .forEach(el => el.addEventListener('change', onSettingChange));

  // Sessions panel toggle
  elSessionsBtn.addEventListener('click', () => togglePanel(elSessionsPanel, elSessionsBtn));

  // Clear history
  elClearHistoryBtn.addEventListener('click', () => {
    elClearConfirm.hidden = false;
    elClearHistoryBtn.style.display = 'none';
  });

  elClearYes.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.sessions);
    elClearConfirm.hidden = true;
    elClearHistoryBtn.style.display = '';
    updateSessionsUI();
  });

  elClearNo.addEventListener('click', () => {
    elClearConfirm.hidden = true;
    elClearHistoryBtn.style.display = '';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (isRunning) {
          pauseTimer();
        } else {
          ensureAudioContext();
          startTimer();
        }
        break;
      case 'KeyR':
        resetTimer();
        break;
      case 'KeyM':
        isMuted = !isMuted;
        saveMute();
        updateMuteUI();
        break;
      case 'KeyS':
        togglePanel(elSettingsPanel, elSettingsBtn);
        break;
    }
  });

  // ===== INIT =====
  function init() {
    document.body.classList.add('mode-' + currentMode);
    populateSettingsUI();
    updateMuteUI();
    updateDisplay();
    updateProgressRing();
    updatePomodoroCounter();
    updateButtons();
    updateTitle();
    updateSessionsUI();
  }

  init();
})();
