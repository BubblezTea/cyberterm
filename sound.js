(function() {
  let audioCtx = null;
  let soundEnabled = true;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playTone(freq, duration, type = 'sine', volume = 0.15) {
    if (!soundEnabled) return;
    if (!audioCtx) return;
    if (audioCtx.state !== 'running') return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
      osc.stop(now + duration);
    } catch(e) {}
  }

  function playClick(high = false) { playTone(high ? 1800 : 1200, 0.05, 'sine', 0.08); }
  function playTyping()            { playTone(880 + Math.random() * 200, 0.03, 'sine', 0.01); }

  function playNarrator() {
    playTone(440, 0.2, 'sine', 0.1);
    setTimeout(() => playTone(660, 0.15, 'sine', 0.08), 80);
  }

  function playLevelUp() {
    playTone(523.25, 0.2, 'sine', 0.12);
    setTimeout(() => playTone(659.25, 0.2, 'sine', 0.12), 150);
    setTimeout(() => playTone(783.99, 0.4, 'sine', 0.12), 300);
  }

  function playCombatHit(isPlayer = true) { playTone(isPlayer ? 300 : 200, 0.15, 'sawtooth', 0.12); }
  function playCombatMiss()               { playTone(100, 0.1, 'sawtooth', 0.08); }

  function playItemUse() {
    playTone(880, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(660, 0.2, 'sine', 0.1), 100);
  }

  function playHover() {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const duration = 0.12;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + duration * 0.35);
    osc.frequency.exponentialRampToValueAtTime(170, now + duration);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(now + duration);
  }

  window.Sound = {
    enable:     (on) => { soundEnabled = on; if (on && !audioCtx) initAudio(); },
    typing:     playTyping,
    narrator:   playNarrator,
    send:       () => playClick(true),
    levelUp:    playLevelUp,
    combatHit:  playCombatHit,
    combatMiss: playCombatMiss,
    itemUse:    playItemUse,
    uiSelect:   () => playClick(true),
    hover:      playHover,
    heal:       () => playTone(660, 0.2, 'sine', 0.1),
  };

  document.body.addEventListener('click', function firstClick() {
    if (!audioCtx) {
      initAudio();
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      gain.connect(audioCtx.destination);
      const osc = audioCtx.createOscillator();
      osc.connect(gain);
      osc.start();
      osc.stop(0.001);
    }
    document.body.removeEventListener('click', firstClick);
  });

  let lastHoverTime = 0;
  document.addEventListener('mouseenter', function(e) {
    const t = e.target;
    if (t && t.nodeType === Node.ELEMENT_NODE) {
      if (t.closest('button, .class-btn, .cb-skill-btn, .tab-btn, .slot-btn, .modal-save-btn, .modal-close-btn, .settings-save-btn, .provider-btn, .hdr-action-btn, .rs-plus')) {
        const now = Date.now();
        if (now - lastHoverTime > 120) {
          Sound.hover();
          lastHoverTime = now;
        }
      }
    }
  }, true);
})();
