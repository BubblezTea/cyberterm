// gui.js

const escapeHtml = window.escapeHtml || function(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
};

const GuiEngine = {
  current: null,
  pendingAction: false,

  show(guiData) {
    this.current = guiData;
    const overlay = document.getElementById('guiOverlay');
    const container = document.getElementById('guiContainer');
    container.innerHTML = this._render(guiData);
    overlay.classList.add('open');
    this._bindEvents(guiData);
  },

  close() {
    document.getElementById('guiOverlay').classList.remove('open');
    this.current = null;
  },

  _terminalOutput(lines, append = true) {
    const linesContainer = document.getElementById('guiTerminalLines');
    if (!linesContainer) return;
    const linesArray = Array.isArray(lines) ? lines : [lines];
    if (!append) linesContainer.innerHTML = '';
    linesArray.forEach(line => {
      const lineEl = document.createElement('div');
      lineEl.className = 'gui-t-line';
      lineEl.textContent = line;
      linesContainer.appendChild(lineEl);
    });
    linesContainer.scrollTop = 999999;
  },

  _terminalSetActions(gui, actions, prompt) {
    const actionsContainer = document.getElementById('guiTActions');
    if (!actionsContainer) return;
    const promptEl = document.getElementById('guiTPrompt');
    if (promptEl && prompt) promptEl.textContent = prompt;
    actionsContainer.innerHTML = actions.map((a, i) => {
      const label = typeof a === 'string' ? a : (a.label || a.action || `ACTION ${i}`);
      const rollAttr = a.roll ? `data-roll="${a.roll}"` : '';
      return `<button class="gui-btn gui-t-action" data-index="${i}" ${rollAttr}>${label}</button>`;
    }).join('');
    const self = this;
    actionsContainer.querySelectorAll('.gui-t-action').forEach(btn => {
      const idx = parseInt(btn.dataset.index);
      btn.addEventListener('click', () => self._handleTerminalAction(gui, idx));
    });
  },

  _buildTerminalPrompt(gui, userDesc, rollText) {
    return `[TERMINAL SESSION - ${gui.title}]
Current terminal screen content:
${gui.data.lines.join('\n')}

${userDesc}
${rollText || ''}

IMPORTANT: You are a TERMINAL SYSTEM. Respond ONLY with terminal output and menu options. 
DO NOT narrate the player's actions. DO NOT describe the environment.
Your response should be structured as a terminal interface.

Output format - return ONLY JSON:
{
  "output": ["line1", "line2"],
  "clearScreen": false,
  "actions": [
    {"label": "Option 1", "roll": null},
    {"label": "Option 2", "roll": "hacking"}
  ],
  "prompt": ">_ ",
  "close": false,
  "creditsDelta": 0,
  "hpDelta": 0,
  "addItems": [],
  "removeItems": []
}`;
  },

  _applyTerminalResponse(gui, resp) {
    if (resp.creditsDelta) State.credits = Math.max(0, State.credits + resp.creditsDelta);
    if (resp.hpDelta) State.hp = Math.max(0, Math.min(State.maxHp, State.hp + resp.hpDelta));
    if (resp.addItems) {
      resp.addItems.forEach(item => {
        const existing = State.inventory.find(i => i.name === item.name);
        if (existing) existing.amount += (item.amount || 1);
        else State.inventory.push({ ...item, amount: item.amount || 1 });
      });
    }
    if (resp.removeItems) {
      resp.removeItems.forEach(item => {
        const idx = State.inventory.findIndex(i => i.name === item.name);
        if (idx !== -1) {
          State.inventory[idx].amount -= (item.amount || 1);
          if (State.inventory[idx].amount <= 0) State.inventory.splice(idx, 1);
        }
      });
    }
    if (resp.clearScreen) {
      this._terminalOutput(resp.output || [], false);
    } else if (resp.output) {
      this._terminalOutput(resp.output);
    }
    if (resp.actions) {
      this._terminalSetActions(gui, resp.actions, resp.prompt || gui.data.prompt);
      gui.data.actions = resp.actions;
      gui.data.prompt = resp.prompt || gui.data.prompt;
    }
    if (resp.lines) gui.data.lines = resp.lines;
    if (resp.close) this.close();
    if (resp.creditsDelta || resp.hpDelta || resp.addItems || resp.removeItems) {
      Ui.updateHeader();
      Ui.renderSidebar();
    }
  },

  async _handleTerminalAction(gui, actionIndex) {
    if (this.pendingAction) return;
    this.pendingAction = true;

    const action = gui.data.actions[actionIndex];
    const label = typeof action === 'string' ? action : (action.label || action.action || `ACTION ${actionIndex}`);

    this._terminalOutput(`> ${label}`);

    let rollText = '';
    if (action.roll === 'hacking') {
      const rollResult = Math.floor(Math.random() * 20) + 1;
      const rollLabel = rollResult === 1 ? 'CRITICAL FAILURE' : rollResult <= 5 ? 'FAILURE' : rollResult <= 12 ? 'MIXED' : rollResult <= 19 ? 'SUCCESS' : 'CRITICAL SUCCESS';
      this._terminalOutput(`[HACKING ROLL: ${rollResult} — ${rollLabel}]`);
      rollText = `Hacking roll: ${rollResult} (${rollLabel})`;
    }

    try {
      const raw = await queueRequest(() => callProvider([{ role: 'user', content: this._buildTerminalPrompt(gui, `User selected: "${label}"`, rollText) }], 800));
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      this._applyTerminalResponse(gui, JSON.parse(cleaned));
    } catch (err) {
      console.error('Terminal action error:', err);
      this._terminalOutput(['[ERROR: System malfunction]', '> Connection lost. Try again?']);
    } finally {
      this.pendingAction = false;
    }
  },

  _render(gui) {
    switch (gui.type) {
      case 'terminal':      return this._renderTerminal(gui);
      case 'shop':          return this._renderShop(gui);
      case 'dialogue_tree': return this._renderDialogue(gui);
      case 'loot':          return this._renderLoot(gui);
      case 'profile':       return this._renderProfile(gui);
      case 'chatbox':       return this._renderChatbox(gui);
      default: return `<div class="gui-panel"><div class="gui-header"><span class="gui-title">ERROR</span><button class="gui-close-btn" id="guiCloseBtn">✕</button></div><div class="gui-body-pad">Unknown GUI type: ${gui.type}</div></div>`;
    }
  },

  async _handleTerminalInput(gui, command) {
    if (this.pendingAction) return;
    this.pendingAction = true;

    this._terminalOutput(`> ${command}`);

    try {
      const raw = await queueRequest(() => callProvider([{ role: 'user', content: this._buildTerminalPrompt(gui, `User entered command: "${command}"`) }], 800));
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      this._applyTerminalResponse(gui, JSON.parse(cleaned));
    } catch (err) {
      console.error('Terminal input error:', err);
      this._terminalOutput(['[ERROR: System malfunction]', '> Connection lost. Try again?']);
    } finally {
      this.pendingAction = false;
      const input = document.getElementById('guiTerminalInput');
      if (input) input.focus();
    }
  },

  _renderTerminal(gui) {
    const d = gui.data;
    const linesHtml = (d.lines || []).map(l => `<div class="gui-t-line">${l}</div>`).join('');
    const actionsHtml = (d.actions || []).map((a, i) => {
      const label = typeof a === 'string' ? a : (a.label || a.action || `ACTION ${i}`);
      const rollAttr = a.roll ? `data-roll="${a.roll}"` : '';
      return `<button class="gui-btn gui-t-action" data-index="${i}" ${rollAttr}>${label}</button>`;
    }).join('');

    return `<div class="gui-panel gui-terminal">
      <div class="gui-header">
        <span class="gui-title gui-t-title">${gui.title || 'TERMINAL'}</span>
        <span class="gui-t-status">ONLINE</span>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      <div class="gui-t-screen">
        <div class="gui-t-lines" id="guiTerminalLines">${linesHtml}</div>
        <div class="gui-t-prompt-row">
          <span class="gui-t-prompt" id="guiTPrompt">${d.prompt || '>_'}</span>
          <span class="gui-t-cursor">█</span>
        </div>
      </div>
      <div class="gui-t-actions" id="guiTActions">${actionsHtml}</div>
      <div class="gui-t-input-row">
        <span class="gui-t-input-prompt">${d.inputPrompt || '$'}</span>
        <input type="text" id="guiTerminalInput" class="gui-t-input" placeholder="type command..." autocomplete="off" spellcheck="false">
        <button class="gui-btn gui-t-send" id="guiTerminalSend">SEND</button>
      </div>
    </div>`;
  },

  _bindEvents(gui) {
    document.getElementById('guiCloseBtn')?.addEventListener('click', () => this.close());

    switch (gui.type) {
      case 'terminal': {
        const actionsContainer = document.getElementById('guiTActions');
        if (actionsContainer) {
          const self = this;
          actionsContainer.querySelectorAll('.gui-t-action').forEach((btn, idx) => {
            btn.addEventListener('click', () => self._handleTerminalAction(gui, idx));
          });
        }
        const input = document.getElementById('guiTerminalInput');
        const sendBtn = document.getElementById('guiTerminalSend');
        if (input && sendBtn) {
          const self = this;
          const send = () => {
            const cmd = input.value.trim();
            if (!cmd) return;
            input.value = '';
            self._handleTerminalInput(gui, cmd);
          };
          sendBtn.addEventListener('click', send);
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
          input.focus();
        }
        break;
      }
      case 'shop':          this._bindShop(gui);     break;
      case 'dialogue_tree': this._bindDialogue(gui); break;
      case 'loot':          this._bindLoot(gui);     break;
      case 'chatbox':       this._bindChatbox(gui);  break;
    }
  },

  _bindShop(gui) {
    const d = gui.data;
    const self = this;
    document.querySelectorAll('.gui-shop-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = d.items[parseInt(btn.dataset.index)];
        if (!item || State.credits < item.price) return;
        State.credits -= item.price;
        const ex = State.inventory.find(i => i.name === item.name);
        if (ex) ex.amount++;
        else State.inventory.push({ name: item.name, amount: 1, description: item.description || '', slot: item.slot || null, statBonus: item.statBonus || null, unsellable: false });
        if (window.Sound) Sound.itemUse();
        Ui.addInstant(`[ BOUGHT: ${item.name} for ₵${item.price} ]`, 'system');
        Ui.updateHeader();
        Ui.renderSidebar();
        self.show(gui);
      });
    });
  },

  _bindDialogue(gui) {
    document.querySelectorAll('.gui-dialogue-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const opt = gui.data.options[parseInt(btn.dataset.index)];
        const roll = opt.roll ? Math.floor(Math.random() * 20) + 1 : null;
        const rollLabel = roll ? (roll === 1 ? 'CRITICAL FAILURE' : roll <= 5 ? 'FAILURE' : roll <= 12 ? 'MIXED' : roll <= 19 ? 'SUCCESS' : 'CRITICAL SUCCESS') : '';
        const rollText = roll ? ` [ROLL: d20=${roll} — ${rollLabel}]` : '';

        this.close();
        Ui.setInputLocked(true);

        const resp = await Llm.send(`[DIALOGUE — ${gui.data.speaker || 'NPC'}] Player chose: "${opt.label}"${rollText}`);
        Engine.applyResponse(resp);
        if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
        if (resp.gui) setTimeout(() => GuiEngine.show(resp.gui), 500);

        const wq = () => { if (Ui.isTyping || Ui.typeQueue.length) setTimeout(wq, 200); else { Ui.setInputLocked(false); Ui.updateHeader(); Ui.renderSidebar(); } };
        wq();
      });
    });
  },

  _bindLoot(gui) {
    const d = gui.data;
    const self = this;
    const refresh = () => {
      const container = document.getElementById('guiLootItems');
      if (!container) return;
      container.innerHTML = self._lootItemsHtml(d.items);
      const takeAll = document.getElementById('guiTakeAll');
      if (takeAll) takeAll.style.display = d.items.length > 1 ? '' : 'none';
      self._bindLoot(gui);
    };

    const takeItem = (idx) => {
      const item = d.items[idx];
      if (!item) return;
      const ex = State.inventory.find(i => i.name === item.name);
      if (ex) ex.amount += item.amount || 1;
      else State.inventory.push({ name: item.name, amount: item.amount || 1, description: item.description || '', slot: null, statBonus: null, unsellable: false });
      if (window.Sound) Sound.itemUse();
      Ui.addInstant(`[ LOOTED: ${item.name} ]`, 'system');
      d.items.splice(idx, 1);
      Ui.renderSidebar();
      refresh();
    };

    document.querySelectorAll('.gui-loot-take').forEach(btn => {
      btn.addEventListener('click', () => takeItem(parseInt(btn.dataset.index)));
    });

    document.getElementById('guiTakeAll')?.addEventListener('click', () => {
      const names = d.items.map(i => i.name);
      d.items.forEach(item => {
        const ex = State.inventory.find(i => i.name === item.name);
        if (ex) ex.amount += item.amount || 1;
        else State.inventory.push({ name: item.name, amount: item.amount || 1, description: item.description || '', slot: null, statBonus: null, unsellable: false });
      });
      if (window.Sound) Sound.itemUse();
      Ui.addInstant(`[ LOOTED: ${names.join(', ')} ]`, 'system');
      d.items = [];
      Ui.renderSidebar();
      refresh();
    });
  },

  _lootItemsHtml(items) {
    if (!items.length) return '<div class="gui-empty">[ NOTHING LEFT ]</div>';
    return items.map((item, i) => `
      <div class="gui-loot-item">
        <div class="gui-loot-item-info">
          <span class="gui-loot-item-name">${item.name}</span>
          <span class="gui-loot-item-desc">${item.description || ''}</span>
        </div>
        <div class="gui-loot-item-right">
          ${item.value ? `<span class="gui-loot-value">₵${item.value}</span>` : ''}
          <span class="gui-loot-qty">×${item.amount || 1}</span>
          <button class="gui-btn gui-loot-take" data-index="${i}">TAKE</button>
        </div>
      </div>`).join('');
  },

  _renderDialogue(gui) {
    const d = gui.data;
    const options = (d.options || []).map((opt, i) =>
      `<button class="gui-dialogue-opt" data-index="${i}" data-roll="${opt.roll || 'none'}">${opt.label}</button>`
    ).join('');
    const initial = (d.speaker || 'NPC')[0].toUpperCase();

    return `<div class="gui-panel gui-dialogue">
      <div class="gui-header">
        <span class="gui-title">${d.speaker || gui.title || 'DIALOGUE'}</span>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      <div class="gui-dialogue-body">
        <div class="gui-dialogue-portrait">${initial}</div>
        <div class="gui-dialogue-content">
          <div class="gui-dialogue-speaker">${d.speaker || ''}</div>
          <div class="gui-dialogue-text">"${d.text}"</div>
        </div>
      </div>
      <div class="gui-dialogue-options">${options || '<div class="gui-empty">[ NO OPTIONS ]</div>'}</div>
    </div>`;
  },

  _renderProfile(gui) {
    const d = gui.data;
    const relColors = { Friendly:'#00ff9c', Neutral:'#aaaaaa', Hostile:'#ff3c4e', Suspicious:'#ffe066', Ally:'#00cfff', Dead:'#555555' };
    const relColor = relColors[d.relationship] || '#aaaaaa';

    const statBars = d.stats ? Object.entries(d.stats).map(([k, v]) =>
      `<div class="gui-profile-stat-row">
        <span class="gui-profile-stat-label">${k.toUpperCase()}</span>
        <div class="gui-profile-bar"><div class="gui-profile-bar-fill" style="width:${Math.min(100, v * 10)}%"></div></div>
        <span class="gui-profile-stat-val">${v}/10</span>
      </div>`).join('') : '';

    const tags = (d.tags || []).map(t => `<span class="gui-profile-tag">${t}</span>`).join('');

    return `<div class="gui-panel gui-profile">
      <div class="gui-header">
        <span class="gui-title">${gui.title || d.name || 'PROFILE'}</span>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      <div class="gui-profile-top">
        <div class="gui-profile-avatar">${(d.name || '?')[0].toUpperCase()}</div>
        <div class="gui-profile-meta">
          <div class="gui-profile-name">${d.name || ''}</div>
          <div class="gui-profile-role">${d.role || ''}</div>
          <span class="gui-profile-rel" style="color:${relColor};border-color:${relColor}44">${d.relationship || 'UNKNOWN'}</span>
        </div>
      </div>
      ${d.description ? `<div class="gui-profile-desc">${d.description}</div>` : ''}
      ${tags ? `<div class="gui-profile-tags">${tags}</div>` : ''}
      ${statBars ? `<div class="gui-profile-stats">${statBars}</div>` : ''}
    </div>`;
  },

  _renderChatbox(gui) {
    const d = gui.data;
    let participants = d.participants || [];
    const playerName = State.playerName || 'You';
    if (!participants.some(p => p.name === playerName)) {
      participants.unshift({ name: playerName, side: 'right', color: 'var(--green)' });
    }
    const npc = participants.find(p => p.name !== playerName);
    const npcName = npc?.name || 'NPC';

    const messages = (d.messages || []).map(msg => {
      let speaker = msg.speaker;
      if (speaker === 'Player') speaker = playerName;
      const isPlayer = speaker === playerName;
      const side = isPlayer ? 'right' : 'left';
      const color = isPlayer ? 'var(--green)' : (npc?.color || 'var(--green-dim)');
      return `<div class="gui-chat-msg gui-chat-${side}">
        <span class="gui-chat-speaker" style="color:${color}">${speaker}</span>
        <div class="gui-chat-bubble" style="border-color:${color}33;background:${color}0a">${msg.text}</div>
      </div>`;
    }).join('');

    const headerParticipants = `<span class="gui-chat-pname" style="color:var(--green)">${playerName}</span>
      <span class="gui-chat-sep">·</span>
      <span class="gui-chat-pname" style="color:${npc?.color || 'var(--green-dim)'}">${npcName}</span>`;

    const replyArea = d.canReply ? `
      <div class="gui-chat-input-row">
        <input type="text" id="guiChatInput" class="gui-chat-input" placeholder="say something..." autocomplete="off" spellcheck="false">
        <button class="gui-btn" id="guiChatSend">SEND</button>
      </div>` : '';

    return `<div class="gui-panel gui-chatbox">
      <div class="gui-header">
        <div class="gui-chat-header-left">
          <span class="gui-title">${gui.title || 'CHAT'}</span>
          <div class="gui-chat-participants">${headerParticipants}</div>
        </div>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      <div class="gui-chat-messages" id="guiChatMessages">${messages}</div>
      ${replyArea}
    </div>`;
  },

  _renderShop(gui) {
    const d = gui.data;
    const items = (d.items || []).map((item, i) => {
      const canAfford = State.credits >= (item.price || 0);
      return `<div class="gui-shop-item">
        <div class="gui-shop-item-info">
          <span class="gui-shop-item-name">${item.name}</span>
          <span class="gui-shop-item-desc">${item.description || ''}</span>
          ${item.slot ? `<span class="gui-shop-item-slot">[${item.slot.toUpperCase()}]</span>` : ''}
        </div>
        <div class="gui-shop-item-right">
          <span class="gui-shop-price ${canAfford ? '' : 'cant-afford'}">₵${item.price || 0}</span>
          <button class="gui-btn gui-shop-buy" data-index="${i}" ${canAfford ? '' : 'disabled'}>BUY</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="gui-panel gui-shop">
      <div class="gui-header">
        <span class="gui-title">${gui.title || 'SHOP'}</span>
        <div class="gui-credits-badge">₵${State.credits}</div>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      ${d.greeting ? `<div class="gui-shop-greeting">"${d.greeting}"</div>` : ''}
      <div class="gui-shop-items">${items || '<div class="gui-empty">[ NOTHING FOR SALE ]</div>'}</div>
    </div>`;
  },

  _renderLoot(gui) {
    const d = gui.data;
    const itemsHtml = this._lootItemsHtml(d.items || []);
    return `<div class="gui-panel gui-loot">
      <div class="gui-header">
        <span class="gui-title">${gui.title || 'LOOT'}</span>
        <button class="gui-close-btn" id="guiCloseBtn">✕</button>
      </div>
      <div class="gui-loot-source">// ${d.source || 'UNKNOWN SOURCE'} //</div>
      <div class="gui-loot-items" id="guiLootItems">${itemsHtml}</div>
      ${(d.items || []).length > 1 ? `<button class="gui-btn gui-take-all-btn" id="guiTakeAll">TAKE ALL</button>` : ''}
    </div>`;
  },

  _chatMsgHtml(msg, participants) {
    const p = participants.find(x => x.name === msg.speaker);
    const color = p?.color || 'var(--green-dim)';
    const isPlayer = msg.speaker === (State.playerName || 'You');
    const side = isPlayer ? 'right' : (p?.side || 'left');
    return `<div class="gui-chat-msg gui-chat-${side}">
      <span class="gui-chat-speaker" style="color:${color}">${msg.speaker}</span>
      <div class="gui-chat-bubble" style="border-color:${color}33;background:${color}0a">${msg.text}</div>
      ${msg.timestamp ? `<span class="gui-chat-time">${msg.timestamp}</span>` : ''}
    </div>`;
  },

  _bindChatbox(gui) {
    const input = document.getElementById('guiChatInput');
    const sendBtn = document.getElementById('guiChatSend');
    if (!input || !sendBtn) return;

    const deviceOwner = State.playerName || 'You';
    gui.data.deviceOwner = deviceOwner;

    let contact = gui.data.contact;
    if (!contact) {
      const participants = gui.data.participants || [];
      const other = participants.find(p => p.name !== deviceOwner);
      contact = other
        ? { name: other.name, color: other.color || '#ff9966' }
        : { name: 'Contact', color: '#ff9966' };
      gui.data.contact = contact;
    }

    let npc = State.npcs.find(n => n.name === contact.name);
    let agility = npc?.stats?.agi ?? null;

    const getTypingDelay = (message, agility) => {
      const wordCount = message.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount === 0) return 200;
      let wpm;
      if (agility !== null && typeof agility === 'number') {
        wpm = Math.min(100, Math.max(20, 20 + agility * 4));
      } else {
        wpm = Math.floor(Math.random() * 13 + 40);
      }
      return Math.min(5000, Math.max(200, (wordCount / (wpm / 60)) * 1000));
    };

    const showTypingIndicator = () => {
      const container = document.getElementById('guiChatMessages');
      if (!container) return;
      const indicator = document.createElement('div');
      indicator.id = 'typingIndicator';
      indicator.className = 'gui-chat-msg gui-chat-left typing-indicator';
      indicator.innerHTML = `
        <span class="gui-chat-speaker" style="color:${contact.color}">${contact.name}</span>
        <div class="gui-chat-bubble typing-bubble">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>`;
      container.appendChild(indicator);
      container.scrollTop = container.scrollHeight;
    };

    const hideTypingIndicator = () => {
      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.remove();
    };

    if (!gui.data.messages) gui.data.messages = [];

    const refreshUI = () => {
      const container = document.getElementById('guiChatMessages');
      if (!container) return;
      container.innerHTML = gui.data.messages.map(msg => {
        let speaker = msg.speaker;
        if (speaker === 'Player') speaker = deviceOwner;
        const isPlayer = speaker === deviceOwner;
        const side = isPlayer ? 'right' : 'left';
        const color = isPlayer ? 'var(--green)' : contact.color;
        return `<div class="gui-chat-msg gui-chat-${side}">
          <span class="gui-chat-speaker" style="color:${color}">${escapeHtml(speaker)}</span>
          <div class="gui-chat-bubble" style="border-color:${color}33;background:${color}0a">${escapeHtml(msg.text)}</div>
        </div>`;
      }).join('');
      container.scrollTop = container.scrollHeight;
    };
    refreshUI();

    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      gui.data.messages.push({ speaker: deviceOwner, text, timestamp: null });
      refreshUI();
      input.disabled = true;
      sendBtn.disabled = true;
      showTypingIndicator();

      const historyMessages = gui.data.messages.slice(-10).map(msg => {
        let speaker = msg.speaker;
        if (speaker === 'Player') speaker = deviceOwner;
        return `${speaker}: ${msg.text}`;
      }).join('\n');

      const prompt = `[CHATBOX — ${gui.title}]

Conversation so far:
${historyMessages}

${deviceOwner} just said: "${text}"

Reply as ${contact.name} in character. Use the conversation history to respond appropriately. Output ONLY the reply text, with no names, no prefixes, no extra formatting. Just the message itself.`;

      let replyRaw = '';
      try {
        replyRaw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 300));
      } catch (err) {
        console.error('Chat error:', err);
        replyRaw = '[...]';
      }

      const lines = replyRaw.split(/\r?\n/);
      const cleanedLines = [];
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.match(new RegExp(`^(${deviceOwner}|Player)\\s*:`, 'i'))) continue;
        if (line.match(new RegExp(`^${contact.name}\\s*:`, 'i'))) {
          line = line.replace(new RegExp(`^${contact.name}\\s*:`, 'i'), '').trim();
        }
        cleanedLines.push(line);
      }
      let finalReply = cleanedLines.join(' ').trim();
      if (!finalReply) finalReply = '[...]';

      setTimeout(() => {
        hideTypingIndicator();
        gui.data.messages.push({ speaker: contact.name, text: finalReply, timestamp: null });
        refreshUI();
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }, getTypingDelay(finalReply, agility));
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    input.focus();
  },
};
