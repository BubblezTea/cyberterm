// statusEffectBuilder.js
const StatusEffectBuilder = (() => {
  let isOpen = false;
  let currentMode = 'simple'; // 'simple' or 'advanced'
  let actions = []; // for advanced mode
  let simpleEffect = { name: '', type: 'dot', duration: 2, value: 5, icon: '🔥' };
  let editingId = null;

  const actionTypes = [
    { value: 'damage', label: 'DAMAGE', params: ['value'] },
    { value: 'heal', label: 'HEAL', params: ['value'] },
    { value: 'skip_turn', label: 'STUN', params: ['duration'] },
    { value: 'change_team', label: 'CHANGE TEAM', params: ['newTeam'] },
    { value: 'stat_mod', label: 'STAT MOD', params: ['stat', 'delta', 'duration'] },
    { value: 'extra_turn', label: 'EXTRA TURN', params: [] },
    { value: 'reflect_damage', label: 'REFLECT', params: ['percent', 'duration'] },
    { value: 'spread', label: 'SPREAD', params: ['effectName'] },
    { value: 'immune', label: 'IMMUNE', params: ['damageType', 'duration'] },
    { value: 'transform_skill', label: 'TRANSFORM', params: ['oldSkillName', 'newSkillName'] },
    { value: 'wait', label: 'WAIT', params: [] }
  ];

  function loadLibrary() {
    const saved = localStorage.getItem('ct_status_effects');
    return saved ? JSON.parse(saved) : [];
  }

  function saveLibrary(library) {
    localStorage.setItem('ct_status_effects', JSON.stringify(library));
  }

  function renderLibrary() {
    const container = document.getElementById('sebLibrary');
    if (!container) return;
    const library = loadLibrary();
    if (!library.length) {
      container.innerHTML = '<div class="seb-empty">No saved effects.</div>';
      return;
    }
    container.innerHTML = library.map(effect => `
      <div class="seb-library-item" data-id="${effect.id}">
        <div class="seb-lib-name">${escapeHtml(effect.name)}</div>
        <div class="seb-lib-desc">${escapeHtml(effect.description || '')}</div>
        <div class="seb-lib-meta">${effect.duration || '?'}T · ${effect.icon || '⚡'}</div>
        <div class="seb-lib-actions">
          <button class="seb-lib-load" data-id="${effect.id}">Load</button>
          <button class="seb-lib-delete" data-id="${effect.id}">Delete</button>
        </div>
      </div>
    `).join('');
    // attach events
    container.querySelectorAll('.seb-lib-load').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const effect = library.find(e => e.id === id);
        if (effect) loadEffect(effect);
      });
    });
    container.querySelectorAll('.seb-lib-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const newLib = library.filter(e => e.id !== id);
        saveLibrary(newLib);
        renderLibrary();
      });
    });
  }

  function loadEffect(effect) {
    editingId = effect.id;
    if (effect.effects) {
      currentMode = 'advanced';
      actions = effect.effects.map(a => ({ ...a }));
      document.getElementById('sebAdvancedName').value = effect.name || '';
      document.getElementById('sebAdvancedDesc').value = effect.description || '';
      document.getElementById('sebAdvancedDuration').value = effect.duration || 3;
      document.getElementById('sebAdvancedIcon').value = effect.icon || '⚡';
      document.getElementById('sebModeSimple').classList.remove('active');
      document.getElementById('sebModeAdvanced').classList.add('active');
      document.getElementById('sebSimplePanel').style.display = 'none';
      document.getElementById('sebAdvancedPanel').style.display = 'block';
      renderActionList();
    } else {
      currentMode = 'simple';
      simpleEffect = {
        name: effect.name,
        type: effect.type || 'dot',
        duration: effect.duration,
        value: effect.value,
        icon: effect.icon
      };
      document.getElementById('sebSimpleName').value = simpleEffect.name;
      document.getElementById('sebSimpleType').value = simpleEffect.type;
      document.getElementById('sebSimpleDuration').value = simpleEffect.duration;
      document.getElementById('sebSimpleValue').value = simpleEffect.value;
      document.getElementById('sebSimpleIcon').value = simpleEffect.icon;
      document.getElementById('sebModeSimple').classList.add('active');
      document.getElementById('sebModeAdvanced').classList.remove('active');
      document.getElementById('sebSimplePanel').style.display = 'block';
      document.getElementById('sebAdvancedPanel').style.display = 'none';
    }
    updatePreview();
  }

  function saveCurrentEffect() {
    let effect;
    if (currentMode === 'simple') {
      const name = document.getElementById('sebSimpleName').value.trim();
      if (!name) return;
      effect = {
        id: editingId || Date.now(),
        name,
        description: '',
        type: document.getElementById('sebSimpleType').value,
        duration: parseInt(document.getElementById('sebSimpleDuration').value) || 1,
        value: parseInt(document.getElementById('sebSimpleValue').value) || 0,
        icon: document.getElementById('sebSimpleIcon').value || '⚡'
      };
    } else {
      const name = document.getElementById('sebAdvancedName').value.trim();
      if (!name) return;
      const description = document.getElementById('sebAdvancedDesc').value;
      const duration = parseInt(document.getElementById('sebAdvancedDuration').value) || 3;
      const icon = document.getElementById('sebAdvancedIcon').value || '⚡';
      if (actions.length === 0) return;
      effect = {
        id: editingId || Date.now(),
        name,
        description,
        duration,
        icon,
        effects: actions.map(a => ({ ...a }))
      };
    }
    const library = loadLibrary();
    const existingIdx = library.findIndex(e => e.id === effect.id);
    if (existingIdx !== -1) {
      library[existingIdx] = effect;
    } else {
      library.push(effect);
    }
    saveLibrary(library);
    renderLibrary();
    if (typeof Ui !== 'undefined') Ui.addInstant(`Effect "${effect.name}" saved.`, 'system');
  }

  function copyToClipboard() {
    let effect;
    if (currentMode === 'simple') {
      const name = document.getElementById('sebSimpleName').value.trim();
      if (!name) return;
      effect = {
        name,
        type: document.getElementById('sebSimpleType').value,
        duration: parseInt(document.getElementById('sebSimpleDuration').value) || 1,
        value: parseInt(document.getElementById('sebSimpleValue').value) || 0,
        icon: document.getElementById('sebSimpleIcon').value || '⚡'
      };
    } else {
      const name = document.getElementById('sebAdvancedName').value.trim();
      if (!name) return;
      effect = {
        name,
        description: document.getElementById('sebAdvancedDesc').value,
        duration: parseInt(document.getElementById('sebAdvancedDuration').value) || 3,
        icon: document.getElementById('sebAdvancedIcon').value || '⚡',
        effects: actions.map(a => ({ ...a }))
      };
    }
    navigator.clipboard.writeText(JSON.stringify(effect, null, 2));
    if (typeof Ui !== 'undefined') Ui.addInstant('Effect JSON copied to clipboard!', 'system');
  }

  function updatePreview() {
    const previewDiv = document.getElementById('sebPreview');
    if (!previewDiv) return;
    if (currentMode === 'simple') {
      const name = document.getElementById('sebSimpleName').value.trim() || '[Unnamed]';
      const type = document.getElementById('sebSimpleType').value;
      const duration = document.getElementById('sebSimpleDuration').value;
      const value = document.getElementById('sebSimpleValue').value;
      const icon = document.getElementById('sebSimpleIcon').value;
      previewDiv.innerHTML = `
        <div class="seb-preview-card">
          <div class="seb-preview-name">${escapeHtml(name)} ${icon}</div>
          <div class="seb-preview-meta">${type.toUpperCase()} · ${duration}T · ${value}</div>
        </div>
      `;
    } else {
      const name = document.getElementById('sebAdvancedName').value.trim() || '[Unnamed]';
      const duration = document.getElementById('sebAdvancedDuration').value;
      const icon = document.getElementById('sebAdvancedIcon').value;
      let actionsHtml = actions.map(a => {
        let params = '';
        if (a.type === 'damage') params = `${a.value} dmg`;
        else if (a.type === 'heal') params = `${a.value} HP`;
        else if (a.type === 'skip_turn') params = `${a.duration} stun`;
        else if (a.type === 'change_team') params = `→ ${a.newTeam}`;
        else if (a.type === 'stat_mod') params = `${a.stat} ${a.delta > 0 ? '+' : ''}${a.delta} (${a.duration}T)`;
        else params = '';
        return `<div class="seb-preview-action">${a.type} ${params} ${a.delay ? `delay ${a.delay}` : ''}</div>`;
      }).join('');
      previewDiv.innerHTML = `
        <div class="seb-preview-card">
          <div class="seb-preview-name">${escapeHtml(name)} ${icon}</div>
          <div class="seb-preview-meta">Duration: ${duration}T</div>
          <div class="seb-preview-actions">${actionsHtml || '<em>No actions</em>'}</div>
        </div>
      `;
    }
  }

  function renderActionList() {
    const container = document.getElementById('sebActionList');
    if (!container) return;
    if (actions.length === 0) {
      container.innerHTML = '<div class="seb-empty">No actions. Click "Add Action" to begin.</div>';
      return;
    }
    container.innerHTML = actions.map((act, idx) => `
      <div class="seb-action-card" data-index="${idx}">
        <div class="seb-action-header">
          <select class="seb-action-type" data-idx="${idx}">
            ${actionTypes.map(t => `<option value="${t.value}" ${act.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          <input type="number" class="seb-action-delay" data-idx="${idx}" placeholder="Delay" value="${act.delay || 0}" style="width:60px;">
          <select class="seb-action-target" data-idx="${idx}">
            <option value="self" ${act.target === 'self' ? 'selected' : ''}>Self</option>
            <option value="enemy" ${act.target === 'enemy' ? 'selected' : ''}>Enemy</option>
            <option value="ally" ${act.target === 'ally' ? 'selected' : ''}>Ally</option>
          </select>
          <button class="seb-action-delete" data-idx="${idx}">✕</button>
          <span class="seb-action-drag">⋮⋮</span>
        </div>
        <div class="seb-action-params" data-idx="${idx}"></div>
      </div>
    `).join('');
    // render params and bind events
    actions.forEach((act, idx) => {
      const paramsDiv = document.querySelector(`.seb-action-params[data-idx="${idx}"]`);
      if (paramsDiv) {
        paramsDiv.innerHTML = renderActionParams(act, idx);
        bindActionParamsEvents(act, idx);
      }
    });
    bindActionEvents();
  }

  function renderActionParams(act, idx) {
    switch (act.type) {
      case 'damage':
      case 'heal':
        return `<input type="number" class="seb-action-value" data-idx="${idx}" placeholder="Value" value="${act.value || 0}">`;
      case 'skip_turn':
        return `<input type="number" class="seb-action-duration" data-idx="${idx}" placeholder="Turns" value="${act.duration || 1}">`;
      case 'change_team':
        return `<select class="seb-action-newteam" data-idx="${idx}">
          <option value="ally" ${act.newTeam === 'ally' ? 'selected' : ''}>Ally</option>
          <option value="enemy" ${act.newTeam === 'enemy' ? 'selected' : ''}>Enemy</option>
        </select>`;
      case 'stat_mod':
        return `
          <select class="seb-action-stat" data-idx="${idx}">
            <option value="str">STR</option><option value="agi">AGI</option><option value="int">INT</option>
            <option value="cha">CHA</option><option value="tec">TEC</option><option value="end">END</option>
          </select>
          <input type="number" class="seb-action-delta" data-idx="${idx}" placeholder="Delta" value="${act.delta || 0}">
          <input type="number" class="seb-action-duration" data-idx="${idx}" placeholder="Turns" value="${act.duration || 1}">
        `;
      case 'reflect_damage':
        return `
          <input type="number" class="seb-action-percent" data-idx="${idx}" placeholder="%" value="${act.percent || 0}">
          <input type="number" class="seb-action-duration" data-idx="${idx}" placeholder="Turns" value="${act.duration || 1}">
        `;
      case 'spread':
        return `<input type="text" class="seb-action-effectname" data-idx="${idx}" placeholder="Effect name" value="${act.effectName || ''}">`;
      case 'immune':
        return `
          <input type="text" class="seb-action-damagetype" data-idx="${idx}" placeholder="Type" value="${act.damageType || ''}">
          <input type="number" class="seb-action-duration" data-idx="${idx}" placeholder="Turns" value="${act.duration || 1}">
        `;
      case 'transform_skill':
        return `
          <input type="text" class="seb-action-oldskill" data-idx="${idx}" placeholder="Old skill" value="${act.oldSkillName || ''}">
          <input type="text" class="seb-action-newskill" data-idx="${idx}" placeholder="New skill" value="${act.newSkillName || ''}">
        `;
      default:
        return '<span>No parameters</span>';
    }
  }

  function bindActionParamsEvents(act, idx) {
    const container = document.querySelector(`.seb-action-params[data-idx="${idx}"]`);
    if (!container) return;
    container.querySelectorAll('.seb-action-value').forEach(inp => inp.addEventListener('input', (e) => { act.value = parseInt(e.target.value) || 0; updatePreview(); }));
    container.querySelectorAll('.seb-action-duration').forEach(inp => inp.addEventListener('input', (e) => { act.duration = parseInt(e.target.value) || 1; updatePreview(); }));
    container.querySelectorAll('.seb-action-newteam').forEach(sel => sel.addEventListener('change', (e) => { act.newTeam = e.target.value; updatePreview(); }));
    container.querySelectorAll('.seb-action-stat').forEach(sel => sel.addEventListener('change', (e) => { act.stat = e.target.value; updatePreview(); }));
    container.querySelectorAll('.seb-action-delta').forEach(inp => inp.addEventListener('input', (e) => { act.delta = parseInt(e.target.value) || 0; updatePreview(); }));
    container.querySelectorAll('.seb-action-percent').forEach(inp => inp.addEventListener('input', (e) => { act.percent = parseInt(e.target.value) || 0; updatePreview(); }));
    container.querySelectorAll('.seb-action-effectname').forEach(inp => inp.addEventListener('input', (e) => { act.effectName = e.target.value; updatePreview(); }));
    container.querySelectorAll('.seb-action-damagetype').forEach(inp => inp.addEventListener('input', (e) => { act.damageType = e.target.value; updatePreview(); }));
    container.querySelectorAll('.seb-action-oldskill').forEach(inp => inp.addEventListener('input', (e) => { act.oldSkillName = e.target.value; updatePreview(); }));
    container.querySelectorAll('.seb-action-newskill').forEach(inp => inp.addEventListener('input', (e) => { act.newSkillName = e.target.value; updatePreview(); }));
  }

  function bindActionEvents() {
    document.querySelectorAll('.seb-action-type').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.idx);
        actions[idx].type = sel.value;
        renderActionList();
        updatePreview();
      });
    });
    document.querySelectorAll('.seb-action-delay').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.idx);
        actions[idx].delay = parseInt(e.target.value) || 0;
        updatePreview();
      });
    });
    document.querySelectorAll('.seb-action-target').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.idx);
        actions[idx].target = e.target.value;
        updatePreview();
      });
    });
    document.querySelectorAll('.seb-action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx);
        actions.splice(idx, 1);
        renderActionList();
        updatePreview();
      });
    });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    // reset
    editingId = null;
    currentMode = 'simple';
    actions = [];
    simpleEffect = { name: '', type: 'dot', duration: 2, value: 5, icon: '🔥' };
    // inject overlay if not exists
    if (!document.getElementById('sebOverlay')) inject();
    const overlay = document.getElementById('sebOverlay');
    overlay.classList.add('open');
    // reset UI
    document.getElementById('sebSimpleName').value = '';
    document.getElementById('sebSimpleType').value = 'dot';
    document.getElementById('sebSimpleDuration').value = 2;
    document.getElementById('sebSimpleValue').value = 5;
    document.getElementById('sebSimpleIcon').value = '🔥';
    document.getElementById('sebAdvancedName').value = '';
    document.getElementById('sebAdvancedDesc').value = '';
    document.getElementById('sebAdvancedDuration').value = 3;
    document.getElementById('sebAdvancedIcon').value = '⚡';
    document.getElementById('sebModeSimple').classList.add('active');
    document.getElementById('sebModeAdvanced').classList.remove('active');
    document.getElementById('sebSimplePanel').style.display = 'block';
    document.getElementById('sebAdvancedPanel').style.display = 'none';
    renderLibrary();
    renderActionList();
    updatePreview();
    bindEvents();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    const overlay = document.getElementById('sebOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function inject() {
    const div = document.createElement('div');
    div.id = 'sebOverlay';
    div.innerHTML = `
      <div class="seb-panel">
        <div class="seb-header">
          <div class="seb-title">STATUS EFFECT FORGE</div>
          <button class="seb-close-btn">✕</button>
        </div>
        <div class="seb-tabs">
          <button id="sebModeSimple" class="seb-tab active">Simple Effect</button>
          <button id="sebModeAdvanced" class="seb-tab">Advanced Sequence</button>
        </div>
        <div class="seb-content">
          <div id="sebSimplePanel" class="seb-panel-simple">
            <div class="seb-field">
              <label>Effect Name</label>
              <input id="sebSimpleName" placeholder="e.g., Burning">
            </div>
            <div class="seb-field-row">
              <div class="seb-field">
                <label>Type</label>
                <select id="sebSimpleType">
                  <option value="dot">Damage Over Time (DOT)</option>
                  <option value="skip">Stun (Skip Turn)</option>
                  <option value="expose">Expose (+% damage taken)</option>
                  <option value="debuff">Debuff (Reduce AGI)</option>
                  <option value="buff">Buff (Energy restore)</option>
                  <option value="buff_hp">Heal (HP restore)</option>
                </select>
              </div>
              <div class="seb-field">
                <label>Duration (turns)</label>
                <input id="sebSimpleDuration" type="number" min="1" max="10" value="2">
              </div>
              <div class="seb-field">
                <label>Value</label>
                <input id="sebSimpleValue" type="number" value="5">
              </div>
              <div class="seb-field">
                <label>Icon</label>
                <input id="sebSimpleIcon" maxlength="2" value="🔥">
              </div>
            </div>
          </div>
          <div id="sebAdvancedPanel" class="seb-panel-advanced" style="display:none">
            <div class="seb-field">
              <label>Effect Name</label>
              <input id="sebAdvancedName" placeholder="e.g., Neural Hijack">
            </div>
            <div class="seb-field">
              <label>Description</label>
              <textarea id="sebAdvancedDesc" rows="2"></textarea>
            </div>
            <div class="seb-field-row">
              <div class="seb-field">
                <label>Duration (turns)</label>
                <input id="sebAdvancedDuration" type="number" min="1" max="10" value="3">
              </div>
              <div class="seb-field">
                <label>Icon</label>
                <input id="sebAdvancedIcon" maxlength="2" value="⚡">
              </div>
            </div>
            <div class="seb-actions-header">
              <span>Action Sequence</span>
              <button id="sebAddAction">+ Add Action</button>
              <button id="sebCopyActions">📋 Copy Actions</button>
              <button id="sebPasteActions">📌 Paste Actions</button>
            </div>
            <div id="sebActionList" class="seb-action-list"></div>
          </div>
          <div class="seb-preview-area">
            <div class="seb-preview-header">Preview</div>
            <div id="sebPreview" class="seb-preview"></div>
          </div>
          <div class="seb-library-area">
            <div class="seb-library-header">Saved Effects</div>
            <div id="sebLibrary" class="seb-library"></div>
          </div>
          <div class="seb-actions">
            <button id="sebSaveEffect">💾 Save Effect</button>
            <button id="sebCopyJson">📋 Copy JSON</button>
            <button id="sebClose">Cancel</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    // attach style
    if (!document.getElementById('sebStyles')) {
      const style = document.createElement('style');
      style.id = 'sebStyles';
      style.textContent = `
        #sebOverlay {
          display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85);
          z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);
        }
        #sebOverlay.open { display: flex; }
        .seb-panel {
          background: #0a0c0e; border: 1px solid #00ff9c; border-radius: 8px; width: 90%; max-width: 1100px;
          max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; color: #00ff9c;
          font-family: 'Share Tech Mono', monospace; box-shadow: 0 0 40px rgba(0,255,156,0.2);
        }
        .seb-header {
          display: flex; justify-content: space-between; align-items: center; padding: 12px 20px;
          border-bottom: 1px solid #00ff9c40; background: #050708;
        }
        .seb-title { font-size: 1.4rem; letter-spacing: 2px; font-weight: bold; }
        .seb-close-btn { background: none; border: none; color: #00ff9c; font-size: 1.2rem; cursor: pointer; }
        .seb-tabs { display: flex; border-bottom: 1px solid #00ff9c40; background: #0a0c0e; }
        .seb-tab {
          padding: 8px 16px; background: none; border: none; color: #5a6e6a; cursor: pointer;
          font-family: inherit; font-size: 0.9rem; transition: 0.2s;
        }
        .seb-tab.active { color: #00ff9c; border-bottom: 2px solid #00ff9c; }
        .seb-content { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .seb-field { display: flex; flex-direction: column; gap: 4px; }
        .seb-field label { font-size: 0.7rem; letter-spacing: 1px; text-transform: uppercase; color: #5a6e6a; }
        .seb-field input, .seb-field select, .seb-field textarea {
          background: #010101; border: 1px solid #2a3a34; color: #00ff9c; padding: 6px 8px;
          font-family: inherit; font-size: 0.9rem; outline: none; border-radius: 4px;
        }
        .seb-field input:focus, .seb-field select:focus, .seb-field textarea:focus { border-color: #00ff9c; }
        .seb-field-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .seb-actions-header { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
        .seb-action-list { border: 1px solid #2a3a34; background: #050708; padding: 8px; max-height: 300px; overflow-y: auto; }
        .seb-action-card { border: 1px solid #2a3a34; margin-bottom: 8px; background: #0a0c0e; }
        .seb-action-header { display: flex; gap: 6px; padding: 6px; background: #010101; border-bottom: 1px solid #2a3a34; }
        .seb-action-params { padding: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
        .seb-preview-area, .seb-library-area { background: #010101; border: 1px solid #2a3a34; padding: 12px; border-radius: 4px; }
        .seb-preview { min-height: 80px; }
        .seb-library { max-height: 200px; overflow-y: auto; }
        .seb-library-item { border-bottom: 1px solid #2a3a34; padding: 8px; }
        .seb-lib-actions button { background: none; border: 1px solid #2a3a34; color: #00ff9c; padding: 2px 6px; margin-right: 6px; cursor: pointer; }
        .seb-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px; }
        .seb-actions button { background: #010101; border: 1px solid #00ff9c; color: #00ff9c; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
        .seb-actions button:hover { background: #00ff9c20; }
        .seb-preview-card { padding: 8px; }
        .seb-preview-name { font-size: 1.2rem; }
        .seb-preview-meta { font-size: 0.8rem; color: #5a6e6a; }
        .seb-preview-actions { margin-top: 6px; }
        .seb-preview-action { font-size: 0.8rem; }
        .seb-empty { color: #5a6e6a; text-align: center; padding: 20px; }
      `;
      document.head.appendChild(style);
    }
  }

  function bindEvents() {
    document.querySelector('#sebOverlay .seb-close-btn').onclick = close;
    document.getElementById('sebModeSimple').onclick = () => {
      currentMode = 'simple';
      document.getElementById('sebModeSimple').classList.add('active');
      document.getElementById('sebModeAdvanced').classList.remove('active');
      document.getElementById('sebSimplePanel').style.display = 'block';
      document.getElementById('sebAdvancedPanel').style.display = 'none';
      updatePreview();
    };
    document.getElementById('sebModeAdvanced').onclick = () => {
      currentMode = 'advanced';
      document.getElementById('sebModeAdvanced').classList.add('active');
      document.getElementById('sebModeSimple').classList.remove('active');
      document.getElementById('sebSimplePanel').style.display = 'none';
      document.getElementById('sebAdvancedPanel').style.display = 'block';
      renderActionList();
      updatePreview();
    };
    document.getElementById('sebAddAction')?.addEventListener('click', () => {
      actions.push({ type: 'damage', delay: 0, target: 'self', value: 10 });
      renderActionList();
      updatePreview();
    });
    document.getElementById('sebCopyActions')?.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(actions));
      if (typeof Ui !== 'undefined') Ui.addInstant('Actions copied.', 'system');
    });
    document.getElementById('sebPasteActions')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          actions.push(...parsed);
          renderActionList();
          updatePreview();
        }
      } catch(e) {}
    });
    document.getElementById('sebSaveEffect')?.addEventListener('click', saveCurrentEffect);
    document.getElementById('sebCopyJson')?.addEventListener('click', copyToClipboard);
    document.getElementById('sebClose')?.addEventListener('click', close);
    document.getElementById('sebSimpleName')?.addEventListener('input', updatePreview);
    document.getElementById('sebSimpleType')?.addEventListener('change', updatePreview);
    document.getElementById('sebSimpleDuration')?.addEventListener('input', updatePreview);
    document.getElementById('sebSimpleValue')?.addEventListener('input', updatePreview);
    document.getElementById('sebSimpleIcon')?.addEventListener('input', updatePreview);
    document.getElementById('sebAdvancedName')?.addEventListener('input', updatePreview);
    document.getElementById('sebAdvancedDesc')?.addEventListener('input', updatePreview);
    document.getElementById('sebAdvancedDuration')?.addEventListener('input', updatePreview);
    document.getElementById('sebAdvancedIcon')?.addEventListener('input', updatePreview);
  }

  return { open };
})();