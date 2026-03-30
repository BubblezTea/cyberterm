// events.js

document.addEventListener('DOMContentLoaded', () => {
  Ui.initVisibilityHandling();

  // combat chat
  const combatChatInput   = document.getElementById('combatChatInput');
  const combatChatSendBtn = document.getElementById('combatChatSendBtn');

  function sendCombatChat() {
    if (!combatChatInput) return;
    const message = combatChatInput.value.trim();
    if (!message) return;
    combatChatInput.value = '';
    CombatEngine.sendCombatChat(message);
  }

  if (combatChatSendBtn) combatChatSendBtn.addEventListener('click', sendCombatChat);
  if (combatChatInput) {
    combatChatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendCombatChat(); }
    });
  }

  document.getElementById('restartBtn').addEventListener('click', () => {
    isDead = false;
    location.reload();
  });

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      const slots = SaveLoad.slots();
      if (slots.length === 0) { Ui.addInstant('No saved game found. Start a new game first.', 'system'); return; }
      const ok = SaveLoad.load(slots[0].name);
      if (!ok) Ui.addInstant('Failed to load save.', 'system');
    });
  }

  // character creation buttons
  const ccStep1Btn = document.getElementById('ccStep1Btn');
  if (ccStep1Btn) ccStep1Btn.addEventListener('click', handleStep1);

  const ccNameInput = document.getElementById('ccName');
  if (ccNameInput) ccNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleStep1(); });

  const ccFinishBtn = document.getElementById('ccFinishBtn');
  if (ccFinishBtn) ccFinishBtn.addEventListener('click', finishCharCreate);

  const ccBackBtn = document.getElementById('ccBackBtn');
  if (ccBackBtn) ccBackBtn.addEventListener('click', () => Ui.showScreen('mainMenuScreen'));

  // settings
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose   = document.getElementById('settingsClose');
  const settingsSave    = document.getElementById('settingsSave');
  const settingsMsg     = document.getElementById('settingsMsg');
  const settingsBtn     = document.getElementById('settingsBtn');
  const menuSettingsBtn = document.getElementById('menuSettingsBtn');

  const providerBtns = ['provGroq', 'provOllama', 'provOpenAI', 'provOpenrouter', 'provGemini', 'provQwen', 'provDeepseek', 'provHuggingface'];

  const providerFieldsMap = {
    groq:        'groqFields',
    ollama:      'ollamaFields',
    openai:      'openaiFields',
    openrouter:  'openrouterFields',
    gemini:      'geminiFields',
    qwen:        'qwenFields',
    deepseek:    'deepseekFields',
    huggingface: 'huggingfaceFields',
  };

  const providerConfigs = {
    groq:        GROQ_CONFIG,
    ollama:      OLLAMA_CONFIG,
    openai:      OPENAI_CONFIG,
    openrouter:  OPENROUTER_CONFIG,
    gemini:      GEMINI_CONFIG,
    qwen:        QWEN_CONFIG,
    deepseek:    DEEPSEEK_CONFIG,
    huggingface: HUGGINGFACE_CONFIG,
  };

  const providerInputIds = {
    groq:        { key: 'cfgGroqKey',        model: 'cfgGroqModel',        url: null },
    ollama:      { key: null,                model: 'cfgOllamaModel',      url: 'cfgOllamaUrl' },
    openai:      { key: 'cfgOpenAiKey',      model: 'cfgOpenAiModel',      url: null },
    openrouter:  { key: 'cfgOpenrouterKey',  model: 'cfgOpenrouterModel',  url: null },
    gemini:      { key: 'cfgGeminiKey',      model: 'cfgGeminiModel',      url: null },
    qwen:        { key: 'cfgQwenKey',        model: 'cfgQwenModel',        url: null },
    deepseek:    { key: 'cfgDeepseekKey',    model: 'cfgDeepseekModel',    url: null },
    huggingface: { key: 'cfgHfKey',          model: 'cfgHfModel',          url: null },
  };

  function openSettings() {
    try {
      Object.entries(providerInputIds).forEach(([provider, ids]) => {
        const cfg = providerConfigs[provider];
        if (ids.key)   { const el = document.getElementById(ids.key);   if (el) el.value = cfg.apiKey || ''; }
        if (ids.model) { const el = document.getElementById(ids.model); if (el) el.value = cfg.model  || ''; }
        if (ids.url)   { const el = document.getElementById(ids.url);   if (el) el.value = cfg.url    || ''; }
      });

      providerBtns.forEach(id => {
        const btn      = document.getElementById(id);
        const provider = id.replace('prov', '').toLowerCase();
        if (btn) btn.classList.toggle('active', AI_PROVIDER === provider);
      });

      Object.entries(providerFieldsMap).forEach(([provider, fieldId]) => {
        const el = document.getElementById(fieldId);
        if (el) el.style.display = AI_PROVIDER === provider ? 'flex' : 'none';
      });

      if (settingsMsg)     settingsMsg.textContent = '';
      if (settingsOverlay) settingsOverlay.classList.add('open');
    } catch (e) {
      console.error('[openSettings crash]', e);
    }
  }

  function closeSettings() {
    settingsOverlay.classList.remove('open');
  }

  providerBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const provider = id.replace('prov', '').toLowerCase();
      AI_PROVIDER    = provider;
      providerBtns.forEach(bid => {
        const b = document.getElementById(bid);
        if (b) b.classList.toggle('active', bid === id);
      });
      Object.entries(providerFieldsMap).forEach(([p, fieldId]) => {
        const el = document.getElementById(fieldId);
        if (el) el.style.display = p === provider ? 'flex' : 'none';
      });
    });
  });

  settingsSave.addEventListener('click', () => {
    Object.entries(providerInputIds).forEach(([provider, ids]) => {
      const cfg = providerConfigs[provider];
      if (ids.key   && document.getElementById(ids.key))   cfg.apiKey = document.getElementById(ids.key).value.trim();
      if (ids.model && document.getElementById(ids.model)) cfg.model  = document.getElementById(ids.model).value.trim() || cfg.model;
      if (ids.url   && document.getElementById(ids.url))   cfg.url    = document.getElementById(ids.url).value.trim()   || cfg.url;
    });

    const needsKey = ['groq', 'openai', 'openrouter', 'gemini', 'qwen', 'deepseek', 'huggingface'];
    if (needsKey.includes(AI_PROVIDER) && !providerConfigs[AI_PROVIDER].apiKey) {
      settingsMsg.textContent = `API KEY REQUIRED FOR ${AI_PROVIDER.toUpperCase()}`;
      settingsMsg.className   = 'settings-msg err';
      return;
    }

    saveAiConfig();
    const cfg = providerConfigs[AI_PROVIDER];
    settingsMsg.textContent = `SAVED — ${AI_PROVIDER.toUpperCase()} / ${cfg.model}`;
    settingsMsg.className   = 'settings-msg ok';
    setTimeout(() => { settingsMsg.textContent = ''; }, 2000);
  });

  settingsClose.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });

  // sound toggles
  const soundOn  = document.getElementById('soundOn');
  const soundOff = document.getElementById('soundOff');
  if (soundOn && soundOff) {
    soundOn.addEventListener('click',  () => { if (window.Sound) Sound.enable(true);  soundOn.classList.add('active');  soundOff.classList.remove('active'); });
    soundOff.addEventListener('click', () => { if (window.Sound) Sound.enable(false); soundOff.classList.add('active'); soundOn.classList.remove('active');  });
    if (window.Sound) soundOn.classList.add('active');
  }

  // combat narration toggle
  const cnOn  = document.getElementById('combatNarrOn');
  const cnOff = document.getElementById('combatNarrOff');
  if (cnOn && cnOff) {
    cnOn.addEventListener('click',  () => { COMBAT_NARRATION_ENABLED = true;  cnOn.classList.add('active');  cnOff.classList.remove('active'); });
    cnOff.addEventListener('click', () => { COMBAT_NARRATION_ENABLED = false; cnOff.classList.add('active'); cnOn.classList.remove('active');  });
    cnOff.classList.add('active');
  }

  // save/load modal
  const modalOverlay = document.getElementById('modalOverlay');
  const modalMsg     = document.getElementById('modalMsg');
  const saveInput    = document.getElementById('saveNameInput');

  function showModal(mode) {
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = mode === 'save' ? '// SAVE GAME //' : '// LOAD GAME //';
    const saveInputArea = document.getElementById('saveInputArea');
    if (saveInputArea) saveInputArea.style.display = mode === 'save' ? 'flex' : 'none';
    if (modalMsg)  { modalMsg.textContent = ''; modalMsg.className = 'modal-msg'; }
    if (saveInput) saveInput.value = '';
    renderModalSlots(mode);
    if (modalOverlay) modalOverlay.classList.add('open');
    if (mode === 'save' && saveInput) setTimeout(() => saveInput.focus(), 50);
  }

  function renderModalSlots(mode) {
    const slots     = SaveLoad.slots();
    const container = document.getElementById('modalSlots');
    if (!container) return;
    if (!slots.length) { container.innerHTML = '<div class="modal-empty">[ NO SAVES FOUND ]</div>'; return; }
    container.innerHTML = slots.map(s => `
      <div class="save-slot">
        <div class="save-slot-info">
          <div class="save-slot-name">${s.name}</div>
          <div class="save-slot-meta">${s.gameTime} &nbsp;|&nbsp; ${new Date(s.savedAt).toLocaleDateString()}</div>
        </div>
        ${mode === 'load'
          ? `<button class="slot-btn" data-action="load"      data-name="${s.name}">LOAD</button>`
          : `<button class="slot-btn" data-action="overwrite" data-name="${s.name}">OVR</button>`}
        <button class="slot-btn del" data-action="delete" data-name="${s.name}">DEL</button>
      </div>`).join('');

    container.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const { action, name } = btn.dataset;
        if (action === 'load') {
          const ok = SaveLoad.load(name);
          if (ok && modalOverlay) modalOverlay.classList.remove('open');
          else if (modalMsg) { modalMsg.textContent = 'LOAD FAILED'; modalMsg.className = 'modal-msg err'; }
        } else if (action === 'overwrite') {
          SaveLoad.save(name);
          if (modalMsg) { modalMsg.textContent = `SAVED TO "${name.toUpperCase()}"`; modalMsg.className = 'modal-msg ok'; }
          renderModalSlots(mode);
        } else if (action === 'delete') {
          SaveLoad.delete(name);
          renderModalSlots(mode);
        }
      });
    });
  }

  if (settingsBtn)     settingsBtn.addEventListener('click', openSettings);
  if (menuSettingsBtn) menuSettingsBtn.addEventListener('click', openSettings);

  const saveBtn    = document.getElementById('saveBtn');
  const loadBtn    = document.getElementById('loadBtn');
  const modalClose = document.getElementById('modalClose');

  if (saveBtn)    saveBtn.addEventListener('click', () => showModal('save'));
  if (loadBtn)    loadBtn.addEventListener('click', () => showModal('load'));
  if (modalClose) modalClose.addEventListener('click', () => modalOverlay?.classList.remove('open'));
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });
  }

  const modalSaveConfirm = document.getElementById('modalSaveConfirm');
  if (modalSaveConfirm) {
    modalSaveConfirm.addEventListener('click', () => {
      const name = saveInput?.value.trim();
      if (!name)              { if (modalMsg) { modalMsg.textContent = 'ENTER A NAME';       modalMsg.className = 'modal-msg err'; } return; }
      if (!State.playerClass) { if (modalMsg) { modalMsg.textContent = 'START A GAME FIRST'; modalMsg.className = 'modal-msg err'; } return; }
      SaveLoad.save(name);
      if (modalMsg)  { modalMsg.textContent = `SAVED AS "${name.toUpperCase()}"`; modalMsg.className = 'modal-msg ok'; }
      if (saveInput) saveInput.value = '';
      renderModalSlots('save');
    });
  }
  if (saveInput) saveInput.addEventListener('keydown', e => { if (e.key === 'Enter') modalSaveConfirm?.click(); });

  // sidebar tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.Sound) Sound.uiSelect();
      document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabPanel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (tabPanel) tabPanel.classList.add('active');
    });
  });

  // mobile sidebar toggle
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  const sidebar             = document.getElementById('sidebar');
  if (mobileSidebarToggle && sidebar) {
    mobileSidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('drawer-open');
      document.body.classList.toggle('sidebar-drawer-open');
    });
    const narrativePane = document.getElementById('narrativePane');
    if (narrativePane) {
      narrativePane.addEventListener('click', () => {
        if (sidebar.classList.contains('drawer-open')) sidebar.classList.remove('drawer-open');
      });
    }
  }

  // dev console
  const consoleOverlay = document.getElementById('consoleOverlay');
  const consoleInput   = document.getElementById('consoleInput');

  function toggleConsole() {
    if (!consoleOverlay) return;
    const open = consoleOverlay.classList.toggle('open');
    if (open && consoleInput) {
      consoleInput.focus();
      if (!document.getElementById('consoleLog').children.length) {
        Console.log('CYBERTERM DEV CONSOLE — type "help" for commands', 'header');
      }
    }
  }

  const consoleBtn = document.getElementById('consoleBtn');
  if (consoleBtn) consoleBtn.addEventListener('click', toggleConsole);

  document.addEventListener('keydown', e => {
    if ((e.key === '`' || e.key === '~') && document.getElementById('gameScreen')?.classList.contains('active')) {
      e.preventDefault();
      toggleConsole();
    }
    if (e.key === 'Escape' && consoleOverlay?.classList.contains('open')) consoleOverlay.classList.remove('open');
  });

  if (consoleInput) {
    consoleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { Console.exec(consoleInput.value); consoleInput.value = ''; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (Console.history.length) {
          Console.histIdx    = Math.min(Console.histIdx + 1, Console.history.length - 1);
          consoleInput.value = Console.history[Console.histIdx];
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        Console.histIdx    = Math.max(Console.histIdx - 1, -1);
        consoleInput.value = Console.histIdx === -1 ? '' : Console.history[Console.histIdx];
      }
    });
  }

  // binary rain
  let rainInterval = null;
  function startBinaryRain() {
    const container = document.getElementById('binaryRain');
    if (!container) return;
    if (rainInterval) clearInterval(rainInterval);
    container.innerHTML = '';
    const maxLeft = container.clientWidth - 20;

    function makeDigit() {
      const d = document.createElement('div');
      d.className   = 'binary-digit';
      d.textContent = Math.random() > 0.5 ? '1' : '0';
      d.style.left  = `${Math.random() * maxLeft}px`;
      const dur     = 3 + Math.random() * 9;
      d.style.animationDuration = `${dur}s`;
      d.style.animationDelay   = `-${Math.random() * dur}s`;
      d.style.fontSize          = `${12 + Math.floor(Math.random() * 8)}px`;
      d.style.opacity           = 0.4 + Math.random() * 0.5;
      return d;
    }

    for (let i = 0; i < 300; i++) container.appendChild(makeDigit());

    rainInterval = setInterval(() => {
      if (!container.isConnected) { clearInterval(rainInterval); return; }
      if (container.querySelectorAll('.binary-digit').length < 280) {
        for (let i = 0; i < 5; i++) container.appendChild(makeDigit());
      }
    }, 5000);
  }

  const mainMenuScreen = document.getElementById('mainMenuScreen');
  if (mainMenuScreen) {
    const observer = new MutationObserver(() => {
      if (mainMenuScreen.classList.contains('active')) startBinaryRain();
      else {
        if (rainInterval) clearInterval(rainInterval);
        const rc = document.getElementById('binaryRain');
        if (rc) rc.innerHTML = '';
      }
    });
    observer.observe(mainMenuScreen, { attributes: true });
  }

  // item popup
  const itemPopupClose = document.getElementById('itemPopupClose');
  if (itemPopupClose) {
    itemPopupClose.addEventListener('click', () => document.getElementById('itemPopup')?.classList.remove('open'));
  }
  const itemPopup = document.getElementById('itemPopup');
  if (itemPopup) {
    itemPopup.addEventListener('click', e => { if (e.target === itemPopup) itemPopup.classList.remove('open'); });
  }

  const backToMenuBtn = document.getElementById('backToMenuBtn');
  if (backToMenuBtn) backToMenuBtn.addEventListener('click', () => Ui.showScreen('mainMenuScreen'));

  const menuStartBtn = document.getElementById('menuStartBtn');
  if (menuStartBtn) menuStartBtn.addEventListener('click', startGameFromMenu);

  // player input
  const sendBtn     = document.getElementById('sendBtn');
  const playerInput = document.getElementById('playerInput');
  if (sendBtn) sendBtn.addEventListener('click', handlePlayerInput);
  if (playerInput) {
    playerInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
    playerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePlayerInput(); }
    });
  }

  // refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (Ui.isTyping || document.getElementById('sendBtn')?.disabled) {
        Ui.addInstant('Wait for current response to finish...', 'system');
        return;
      }
      refreshLastResponse().catch(err => Ui.addInstant('Refresh failed: ' + err.message, 'system'));
    });
  }

  window.refreshLastResponse = refreshLastResponse;
  boot();
});
