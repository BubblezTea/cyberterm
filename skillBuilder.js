// skillBuilder.js (updated)

let isOpen = false;
let st = {};
let attachedEffects = [];
let editingIndex = -1;

const SkillBuilder = (() => {

  function preventDragAndDrop() {
    // Prevent default drag behavior on the entire overlay
    const overlay = g('skbOverlay');
    if (overlay) {
      overlay.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });
      overlay.addEventListener('drag', (e) => {
        e.preventDefault();
        return false;
      });
      overlay.addEventListener('dragend', (e) => {
        e.preventDefault();
        return false;
      });
    }
    
    // Also prevent drag on all interactive elements inside
    const panel = document.querySelector('.skb-panel');
    if (panel) {
      panel.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });
    }
    
    // Prevent text selection while dragging on the header
    const header = document.querySelector('.skb-hdr');
    if (header) {
      header.addEventListener('mousedown', (e) => {
        // Only prevent if it's a left-click drag attempt
        if (e.button === 0) {
          // Don't prevent completely - just add a class
          header.style.userSelect = 'none';
        }
      });
      header.addEventListener('mouseup', () => {
        header.style.userSelect = '';
      });
    }
  }


  const statusTypeInfo = {
    dot:     { valueLabel: 'DMG/TURN',     valueHint: 'damage dealt per turn',   desc: 'Inflicts burn damage each turn for the duration.' },
    skip:    { valueLabel: 'UNUSED',       valueHint: 'locked to 0',             desc: 'Locks the enemy — they lose their next turn(s).' },
    expose:  { valueLabel: '% BONUS DMG',  valueHint: '% extra damage taken',    desc: 'Marks target — they take amplified incoming damage.' },
    debuff:  { valueLabel: 'AGI REDUCED',  valueHint: 'points of AGI stripped',  desc: 'Reduces enemy agility, lowering their dodge chance.' },
    buff:    { valueLabel: 'ENERGY GAINED',valueHint: 'energy restored to self', desc: 'Channels energy to the user. Value must be > 0.' },
    buff_hp: { valueLabel: 'HP RESTORED',  valueHint: 'hit points healed',       desc: 'Mends wounds, restoring a set amount of HP.' },
  };

  const costHints = [
    [0,  0,  'Zero cost — freely spammable.'],
    [1,  5,  'Minimal cost — nearly free.'],
    [6,  12, 'Low cost — efficient to use.'],
    [13, 20, 'Moderate — watch your energy.'],
    [21, 30, 'High cost — use with intent.'],
    [31, 40, 'Very costly — emergency only.'],
    [41, 99, 'Extreme — drains nearly all energy.'],
  ];

  const cdHints = [
    'No cooldown — usable every turn.',
    '1-turn wait — nearly instant recharge.',
    '2-turn cooldown — short recovery.',
    '3 turns between uses.',
    '4-turn cooldown — use wisely.',
    'Maximum — reserve for critical moments.',
  ];

  const actionTypes = [
    { value: 'damage', label: 'DAMAGE', desc: 'Deal direct damage' },
    { value: 'heal', label: 'HEAL', desc: 'Restore HP' },
    { value: 'skip_turn', label: 'SKIP TURN', desc: 'Stun the target' },
    { value: 'change_team', label: 'CHANGE TEAM', desc: 'Switch sides' },
    { value: 'stat_mod', label: 'STAT MOD', desc: 'Modify a stat temporarily' },
    { value: 'extra_turn', label: 'EXTRA TURN', desc: 'Give an extra action' },
    { value: 'reflect_damage', label: 'REFLECT', desc: 'Reflect incoming damage' },
    { value: 'spread', label: 'SPREAD', desc: 'Spread effect to nearby enemies' },
    { value: 'immune', label: 'IMMUNE', desc: 'Grant damage immunity' },
    { value: 'transform_skill', label: 'TRANSFORM', desc: 'Replace a skill' },
    { value: 'wait', label: 'WAIT', desc: 'Delayed action' },
  ];

  let isOpen = false;
  let st = {};
  let actionBlocks = []; // Store atomic action blocks for custom effects

  function resetState() {
    st = {
      name: '', description: '', scaling: '',
      energyCost: 10,
      dmgEnabled: false, dmgMin: 5, dmgMax: 15,
      stEnabled: false, stName: '', stType: 'dot',
      stDuration: 2, stValue: 5, stIcon: '🔥',
      cooldown: 0,
      customEffectEnabled: false,
      customEffectName: '',
      customEffectDuration: 2,
      customEffectDescription: '',
    };
    actionBlocks = [];
  }

  function renderAttachedEffects() {
    const container = document.getElementById('skbAttachedEffects');
    if (!container) return;
    if (!attachedEffects.length) {
      container.innerHTML = '<div class="skb-empty-effects">No additional effects attached.</div>';
      return;
    }
    container.innerHTML = attachedEffects.map((eff, idx) => `
      <div class="skb-attached-effect" data-idx="${idx}">
        <span class="skb-effect-name">${eff.name}</span>
        <span class="skb-effect-icon">${eff.icon || '⚡'}</span>
        <span class="skb-effect-desc">${eff.duration ? `${eff.duration}T` : ''} ${eff.type ? `· ${eff.type.toUpperCase()}` : ''}</span>
        <button class="skb-remove-effect" data-idx="${idx}">✕</button>
      </div>
    `).join('');
    container.querySelectorAll('.skb-remove-effect').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        attachedEffects.splice(idx, 1);
        renderAttachedEffects();
        onChange();
      });
    });
  }

  function populateFromSkill(skill) {
    // Basic fields
    const nameEl = g('skbName');
    if (nameEl) nameEl.value = skill.name || '';
    const descEl = g('skbDesc');
    if (descEl) descEl.value = skill.description || '';
    const scalingEl = g('skbScaling');
    if (scalingEl) scalingEl.value = skill.statScaling || '';
    const costRange = g('skbCostRange');
    if (costRange) costRange.value = skill.energyCost || 10;
    const dmgToggle = g('skbDmgToggle');
    if (dmgToggle) dmgToggle.checked = !!skill.damage;
    const dmgMin = g('skbDmgMin');
    const dmgMax = g('skbDmgMax');
    if (skill.damage) {
      if (dmgMin) dmgMin.value = skill.damage[0] || 5;
      if (dmgMax) dmgMax.value = skill.damage[1] || 15;
    } else {
      if (dmgMin) dmgMin.value = 5;
      if (dmgMax) dmgMax.value = 15;
    }
    const cdRange = g('skbCdRange');
    if (cdRange) cdRange.value = skill.cooldown || 0;
    
    // Status effects
    attachedEffects = [];
    
    if (skill.statusEffect) {
      // Simple single effect (legacy)
      const stToggle = g('skbStToggle');
      if (stToggle) stToggle.checked = true;
      const stName = g('skbStName');
      if (stName) stName.value = skill.statusEffect.name || '';
      const stType = g('skbStType');
      if (stType) stType.value = skill.statusEffect.type || 'dot';
      const stDuration = g('skbStDuration');
      if (stDuration) stDuration.value = skill.statusEffect.duration || 2;
      const stValue = g('skbStValue');
      if (stValue) {
        stValue.value = skill.statusEffect.type === 'skip' ? 0 : (skill.statusEffect.value || 5);
      }
      const stIcon = g('skbStIcon');
      if (stIcon) stIcon.value = skill.statusEffect.icon || '🔥';
    } else if (skill.statusEffects && skill.statusEffects.length) {
      // New format with array of effects
      attachedEffects = [...skill.statusEffects];
      const stToggle = g('skbStToggle');
      if (stToggle) stToggle.checked = false;
    } else {
      const stToggle = g('skbStToggle');
      if (stToggle) stToggle.checked = false;
    }
    
    renderAttachedEffects();
    onChange();
  }

  function open(skillToEdit = null) {
    if (isOpen) return;
    isOpen = true;
    
    if (skillToEdit) {
      editingIndex = State.skills.findIndex(s => s === skillToEdit);
      if (editingIndex === -1) editingIndex = -1;
    } else {
      editingIndex = -1;
    }
    
    resetState();
    if (skillToEdit) {
      window._pendingEditSkill = skillToEdit;
    } else {
      window._pendingEditSkill = null;
    }
    
    inject();  // creates DOM elements
    
    setTimeout(() => {
      const ov = g('skbOverlay');
      if (ov) ov.classList.add('open');
      
      if (window._pendingEditSkill) {
        populateFromSkill(window._pendingEditSkill);
        window._pendingEditSkill = null;
      }
      onChange();
    }, 10);
    
    bindEvents();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener('keydown', onKey);
    const ov = g('skbOverlay');
    if (ov && ov.classList.contains('open')) {
      ov.classList.remove('open');
      // Wait for animation to finish before removing
      setTimeout(() => {
        if (ov.parentNode) ov.remove();
      }, 340);
    }
  }

  function g(id) { return document.getElementById(id); }

  function generateActionBlockHtml(block, idx) {
    const typeInfo = actionTypes.find(t => t.value === block.type) || actionTypes[0];
    return `
      <div class="skb-action-block" data-index="${idx}" style="border:1px solid var(--border); background:var(--bg3); margin-bottom:8px; position:relative;">
        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--bg2); border-bottom:1px solid var(--border);">
          <select class="skb-action-type" data-block="${idx}" style="flex:2; background:var(--bg); border:1px solid var(--border); color:var(--text); font-family:'Share Tech Mono',monospace; font-size:10px; padding:4px 8px;">
            ${actionTypes.map(t => `<option value="${t.value}" ${block.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          <input type="number" class="skb-action-delay" data-block="${idx}" placeholder="delay" value="${block.delay || 0}" style="width:60px; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:4px 6px; font-size:10px;">
          <select class="skb-action-target" data-block="${idx}" style="width:80px; background:var(--bg); border:1px solid var(--border); color:var(--text); font-size:10px;">
            <option value="enemy" ${block.target === 'enemy' ? 'selected' : ''}>Enemy</option>
            <option value="self" ${block.target === 'self' ? 'selected' : ''}>Self</option>
            <option value="ally" ${block.target === 'ally' ? 'selected' : ''}>Ally</option>
          </select>
          <button class="skb-action-delete" data-index="${idx}" style="background:transparent; border:1px solid var(--border); color:var(--red); padding:2px 8px; cursor:pointer;">✕</button>
          <div class="skb-action-drag" style="cursor:grab; color:var(--text-lo); padding:0 4px;">⋮⋮</div>
        </div>
        <div class="skb-action-params" style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:8px;">
          ${renderActionParams(block, idx)}
        </div>
      </div>
    `;
  }

  function renderActionParams(block, idx) {
    switch (block.type) {
      case 'damage':
      case 'heal':
        return `<input type="number" class="skb-action-value" data-block="${idx}" placeholder="value" value="${block.value || 0}" style="width:80px; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:4px 6px;">`;
      
      case 'skip_turn':
        return `<input type="number" class="skb-action-duration" data-block="${idx}" placeholder="turns" value="${block.duration || 1}" style="width:80px; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:4px 6px;">`;
      
      case 'change_team':
        return `<select class="skb-action-newteam" data-block="${idx}" style="width:100px; background:var(--bg); border:1px solid var(--border); color:var(--text);">
          <option value="ally" ${block.newTeam === 'ally' ? 'selected' : ''}>Ally</option>
          <option value="enemy" ${block.newTeam === 'enemy' ? 'selected' : ''}>Enemy</option>
        </select>`;
      
      case 'stat_mod':
        return `
          <select class="skb-action-stat" data-block="${idx}" style="width:70px;">
            <option value="str" ${block.stat === 'str' ? 'selected' : ''}>STR</option>
            <option value="agi" ${block.stat === 'agi' ? 'selected' : ''}>AGI</option>
            <option value="int" ${block.stat === 'int' ? 'selected' : ''}>INT</option>
            <option value="cha" ${block.stat === 'cha' ? 'selected' : ''}>CHA</option>
            <option value="tec" ${block.stat === 'tec' ? 'selected' : ''}>TEC</option>
            <option value="end" ${block.stat === 'end' ? 'selected' : ''}>END</option>
          </select>
          <input type="number" class="skb-action-delta" data-block="${idx}" placeholder="delta" value="${block.delta || 0}" style="width:70px;">
          <input type="number" class="skb-action-duration" data-block="${idx}" placeholder="turns" value="${block.duration || 1}" style="width:70px;">
        `;
      
      case 'reflect_damage':
        return `
          <input type="number" class="skb-action-percent" data-block="${idx}" placeholder="%" value="${block.percent || 0}" style="width:70px;">
          <input type="number" class="skb-action-duration" data-block="${idx}" placeholder="turns" value="${block.duration || 1}" style="width:70px;">
        `;
      
      case 'spread':
        return `
          <input type="text" class="skb-action-effectname" data-block="${idx}" placeholder="effect name" value="${block.effectName || ''}" style="width:120px;">
          <select class="skb-action-radius" data-block="${idx}" style="width:60px;">
            <option value="1" ${block.radius === 1 ? 'selected' : ''}>Radius 1</option>
          </select>
        `;
      
      case 'immune':
        return `
          <input type="text" class="skb-action-damagetype" data-block="${idx}" placeholder="damage type" value="${block.damageType || ''}" style="width:100px;">
          <input type="number" class="skb-action-duration" data-block="${idx}" placeholder="turns" value="${block.duration || 1}" style="width:70px;">
        `;
      
      case 'transform_skill':
        return `
          <input type="text" class="skb-action-oldskill" data-block="${idx}" placeholder="old skill name" value="${block.oldSkillName || ''}" style="width:120px;">
          <input type="text" class="skb-action-newskill" data-block="${idx}" placeholder="new skill name" value="${block.newSkillName || ''}" style="width:120px;">
        `;
      
      default:
        return `<span style="color:var(--text-lo);">No parameters needed</span>`;
    }
  }

  function collectActionBlocks() {
    const blocks = [];
    document.querySelectorAll('.skb-action-block').forEach((el, idx) => {
      const block = {
        type: el.querySelector('.skb-action-type')?.value || 'damage',
        delay: parseInt(el.querySelector('.skb-action-delay')?.value) || 0,
        target: el.querySelector('.skb-action-target')?.value || 'enemy',
      };
      
      // Get params based on type
      const valueEl = el.querySelector('.skb-action-value');
      if (valueEl) block.value = parseInt(valueEl.value) || 0;
      
      const durationEl = el.querySelector('.skb-action-duration');
      if (durationEl) block.duration = parseInt(durationEl.value) || 1;
      
      const newTeamEl = el.querySelector('.skb-action-newteam');
      if (newTeamEl) block.newTeam = newTeamEl.value;
      
      const statEl = el.querySelector('.skb-action-stat');
      if (statEl) block.stat = statEl.value;
      
      const deltaEl = el.querySelector('.skb-action-delta');
      if (deltaEl) block.delta = parseInt(deltaEl.value) || 0;
      
      const percentEl = el.querySelector('.skb-action-percent');
      if (percentEl) block.percent = parseInt(percentEl.value) || 0;
      
      const effectNameEl = el.querySelector('.skb-action-effectname');
      if (effectNameEl) block.effectName = effectNameEl.value;
      
      const damageTypeEl = el.querySelector('.skb-action-damagetype');
      if (damageTypeEl) block.damageType = damageTypeEl.value;
      
      const oldSkillEl = el.querySelector('.skb-action-oldskill');
      if (oldSkillEl) block.oldSkillName = oldSkillEl.value;
      
      const newSkillEl = el.querySelector('.skb-action-newskill');
      if (newSkillEl) block.newSkillName = newSkillEl.value;
      
      blocks.push(block);
    });
    return blocks;
  }

  function renderActionBlocks() {
    const container = g('skbActionBlocks');
    if (!container) return;
    
    if (actionBlocks.length === 0) {
      container.innerHTML = '<div style="color:var(--text-lo); text-align:center; padding:12px;">No actions. Click "+ ADD ACTION" to create effect chain.</div>';
      return;
    }
    
    container.innerHTML = actionBlocks.map((block, idx) => generateActionBlockHtml(block, idx)).join('');
    
    // Re-bind events
    container.querySelectorAll('.skb-action-type').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.block);
        const newType = sel.value;
        actionBlocks[idx] = { ...actionBlocks[idx], type: newType };
        renderActionBlocks();
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-delay').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].delay = parseInt(inp.value) || 0;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-target').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.block);
        actionBlocks[idx].target = sel.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-value').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].value = parseInt(inp.value) || 0;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-duration').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].duration = parseInt(inp.value) || 1;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-newteam').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.block);
        actionBlocks[idx].newTeam = sel.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-stat').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.block);
        actionBlocks[idx].stat = sel.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-delta').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].delta = parseInt(inp.value) || 0;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-percent').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].percent = parseInt(inp.value) || 0;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-effectname').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].effectName = inp.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-damagetype').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].damageType = inp.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-oldskill').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].oldSkillName = inp.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-newskill').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.block);
        actionBlocks[idx].newSkillName = inp.value;
        onChange();
      });
    });
    
    container.querySelectorAll('.skb-action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index);
        actionBlocks.splice(idx, 1);
        renderActionBlocks();
        onChange();
      });
    });
  }

  function inject() {
    const ex = g('skbOverlay');
    if (ex) ex.remove();
    const icons = ['🔥','⚡','☠','🌀','❄','🩸','💀','⚔','🛡','🧠','💥','🔮','⚙','🕸','🌑','🗡'];
    const iconBtns = icons.map(ic => `<button class="skb-icon-btn" type="button" data-icon="${ic}">${ic}</button>`).join('');

    const div = document.createElement('div');
    div.id = 'skbOverlay';
    div.innerHTML = `
<div class="skb-panel">

  <div class="skb-hdr">
    <div class="skb-hdr-left">
      <span class="skb-corner-tag">NEURAL WEAVE STUDIO</span>
      <span class="skb-title">// SKILL FORGE //</span>
    </div>
    <button class="skb-close-btn" id="skbClose" type="button">✕ EXIT</button>
  </div>

  <div class="skb-body">

    <div class="skb-flow">

      <div class="skb-block" data-block="identity">
        <div class="skb-bk-hdr">
          <span class="skb-bk-num">①</span>
          <div class="skb-bk-meta">
            <span class="skb-bk-label">IDENTITY</span>
            <span class="skb-bk-sub">name · description · scaling</span>
          </div>
          <span class="skb-badge-req">REQUIRED</span>
        </div>
        <div class="skb-bk-body">
          <div class="skb-field">
            <label class="skb-lbl">SKILL NAME</label>
            <input class="skb-input" id="skbName" type="text" placeholder="e.g. Neural Disruptor" maxlength="32" autocomplete="off" spellcheck="false" />
          </div>
          <div class="skb-field">
            <label class="skb-lbl">DESCRIPTION</label>
            <textarea class="skb-input skb-ta" id="skbDesc" placeholder="Combat use description — shown on skill card..." rows="2" maxlength="120" spellcheck="false"></textarea>
          </div>
          <div class="skb-field">
            <label class="skb-lbl">STAT SCALING</label>
            <select class="skb-select" id="skbScaling">
              <option value="">— NONE —</option>
              <option value="str">STR · Strength</option>
              <option value="agi">AGI · Agility</option>
              <option value="int">INT · Intelligence</option>
              <option value="cha">CHA · Charisma</option>
              <option value="tec">TEC · Technology</option>
              <option value="end">END · Endurance</option>
            </select>
            <div class="skb-field-hint" id="skbScalingHint">Stat bonus added to damage rolls.</div>
          </div>
        </div>
      </div>

      <div class="skb-wire"><div class="skb-wire-inner"></div></div>

      <div class="skb-block" data-block="cost">
        <div class="skb-bk-hdr">
          <span class="skb-bk-num">②</span>
          <div class="skb-bk-meta">
            <span class="skb-bk-label">ENERGY COST</span>
            <span class="skb-bk-sub">consumed on activation</span>
          </div>
          <span class="skb-badge-req">REQUIRED</span>
        </div>
        <div class="skb-bk-body">
          <div class="skb-slider-group">
            <div class="skb-slider-top">
              <label class="skb-lbl">COST</label>
              <div class="skb-val-badge"><span id="skbCostDisplay">10</span><span class="skb-unit">E</span></div>
            </div>
            <input class="skb-range" type="range" id="skbCostRange" min="0" max="50" value="10" />
            <div class="skb-range-ticks"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>
          </div>
          <div class="skb-hint-line" id="skbCostHint">Low cost — efficient to use.</div>
        </div>
      </div>

      <div class="skb-wire"><div class="skb-wire-inner"></div></div>

      <div class="skb-block skb-optional" id="skbBlockDmg" data-block="damage">
        <div class="skb-bk-hdr">
          <span class="skb-bk-num">③</span>
          <div class="skb-bk-meta">
            <span class="skb-bk-label">DAMAGE</span>
            <span class="skb-bk-sub">direct hit damage range</span>
          </div>
          <label class="skb-toggle" for="skbDmgToggle">
            <input type="checkbox" id="skbDmgToggle" />
            <span class="skb-track"><span class="skb-thumb"></span></span>
            <span class="skb-toggle-txt" id="skbDmgTxt">OFF</span>
          </label>
        </div>
        <div class="skb-collapse" id="skbDmgBody">
          <div class="skb-collapse-inner">
            <div class="skb-dmg-row">
              <div class="skb-field">
                <label class="skb-lbl">MIN DMG</label>
                <input class="skb-input skb-num" type="number" id="skbDmgMin" min="1" max="999" value="5" />
              </div>
              <div class="skb-dmg-sep">—</div>
              <div class="skb-field">
                <label class="skb-lbl">MAX DMG</label>
                <input class="skb-input skb-num" type="number" id="skbDmgMax" min="1" max="999" value="15" />
              </div>
            </div>
            <div class="skb-dmg-vis">
              <div class="skb-dmg-track">
                <div class="skb-dmg-fill" id="skbDmgFill"></div>
              </div>
              <div class="skb-dmg-label" id="skbDmgLabel">5 – 15 damage per hit</div>
            </div>
          </div>
        </div>
      </div>

      <div class="skb-wire"><div class="skb-wire-inner"></div></div>

      <div class="skb-block skb-optional" id="skbBlockSt" data-block="status">
        <div class="skb-bk-hdr">
          <span class="skb-bk-num">④</span>
          <div class="skb-bk-meta">
            <span class="skb-bk-label">STATUS EFFECT</span>
            <span class="skb-bk-sub">applied on hit</span>
          </div>
          <label class="skb-toggle" for="skbStToggle">
            <input type="checkbox" id="skbStToggle" />
            <span class="skb-track"><span class="skb-thumb"></span></span>
            <span class="skb-toggle-txt" id="skbStTxt">OFF</span>
          </label>
        </div>
        <div class="skb-collapse" id="skbStBody">
          <div class="skb-collapse-inner">
            
            <!-- Effect Type Toggle: Simple vs Advanced -->
            <div class="skb-field">
              <label class="skb-lbl">EFFECT MODE</label>
              <div style="display:flex; gap:8px;">
                <button type="button" id="skbEffectSimpleBtn" class="skb-mode-btn" style="flex:1; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:6px;">SIMPLE</button>
                <button type="button" id="skbEffectAdvancedBtn" class="skb-mode-btn" style="flex:1; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:6px;">ADVANCED</button>
              </div>
            </div>
            
            <!-- Simple Mode (original) -->
            <div id="skbSimpleMode">
              <div class="skb-field">
                <label class="skb-lbl">EFFECT TYPE</label>
                <select class="skb-select" id="skbStType">
                  <option value="dot">DOT · Damage Over Time</option>
                  <option value="skip">STUN · Skip Enemy Turn</option>
                  <option value="expose">EXPOSE · Amplify Damage Taken</option>
                  <option value="debuff">DEBUFF · Reduce AGI</option>
                  <option value="buff">BUFF · Restore Energy (self)</option>
                  <option value="buff_hp">HEAL · Restore HP (self)</option>
                </select>
                <div class="skb-type-desc" id="skbTypeDesc">Inflicts burn damage each turn for the duration.</div>
              </div>
              <div class="skb-field">
                <label class="skb-lbl">EFFECT NAME</label>
                <input class="skb-input" type="text" id="skbStName" placeholder="e.g. Neural Burn, Stunned, Bleeding..." maxlength="24" autocomplete="off" spellcheck="false" />
              </div>
              <div class="skb-field-row">
                <div class="skb-field">
                  <label class="skb-lbl">DURATION<span class="skb-unit-hint"> (turns)</span></label>
                  <input class="skb-input skb-num" type="number" id="skbStDuration" min="1" max="10" value="2" />
                </div>
                <div class="skb-field">
                  <label class="skb-lbl" id="skbValLbl">VALUE<span class="skb-unit-hint" id="skbValHint"> (dmg/turn)</span></label>
                  <input class="skb-input skb-num" type="number" id="skbStValue" min="0" max="999" value="5" />
                </div>
              </div>
              <div class="skb-field">
                <label class="skb-lbl">ICON</label>
                <div class="skb-icon-row">
                  <input class="skb-input skb-icon-in" type="text" id="skbStIcon" value="🔥" maxlength="4" />
                  <div class="skb-icon-grid">${iconBtns}</div>
                </div>
              </div>
            </div>
            
            <!-- Advanced Mode (atomic actions) -->
            <div id="skbAdvancedMode" style="display:none;">
              <div class="skb-field">
                <label class="skb-lbl">EFFECT NAME</label>
                <input class="skb-input" type="text" id="skbCustomEffectName" placeholder="e.g. Neural Hijack, Delayed Payload..." maxlength="32" />
              </div>
              <div class="skb-field">
                <label class="skb-lbl">DESCRIPTION</label>
                <textarea class="skb-input skb-ta" id="skbCustomEffectDesc" rows="2" placeholder="What this status effect does narratively..." maxlength="120"></textarea>
              </div>
              <div class="skb-field-row">
                <div class="skb-field">
                  <label class="skb-lbl">DURATION<span class="skb-unit-hint"> (turns)</span></label>
                  <input class="skb-input skb-num" type="number" id="skbCustomEffectDuration" min="1" max="10" value="3" />
                </div>
                <div class="skb-field">
                  <label class="skb-lbl">ICON</label>
                  <div class="skb-icon-row" style="margin-top:0;">
                    <input class="skb-input skb-icon-in" type="text" id="skbCustomEffectIcon" value="⚡" maxlength="4" style="width:48px;" />
                  </div>
                </div>
              </div>
              
              <div class="skb-field">
                <label class="skb-lbl">ACTION SEQUENCE</label>
                <div style="margin-bottom:8px; display:flex; gap:8px;">
                  <button type="button" id="skbAddActionBtn" class="skb-mode-btn" style="background:var(--green-lo); border-color:var(--green);">+ ADD ACTION</button>
                  <button type="button" id="skbCopyActionsBtn" class="skb-mode-btn">COPY ALL</button>
                  <button type="button" id="skbPasteActionsBtn" class="skb-mode-btn">PASTE</button>
                </div>
                <div id="skbActionBlocks" style="max-height:300px; overflow-y:auto; border:1px solid var(--border); padding:8px; background:var(--bg);">
                  <div style="color:var(--text-lo); text-align:center; padding:12px;">No actions. Click "+ ADD ACTION" to create effect chain.</div>
                </div>
                <div class="skb-field-hint">Actions execute from top to bottom. Use delay to create sequences (e.g., damage now, wait 2, damage again).</div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      <div class="skb-wire"><div class="skb-wire-inner"></div></div>

      <div class="skb-block" data-block="cooldown">
        <div class="skb-bk-hdr">
          <span class="skb-bk-num">⑤</span>
          <div class="skb-bk-meta">
            <span class="skb-bk-label">COOLDOWN</span>
            <span class="skb-bk-sub">turns before reuse</span>
          </div>
          <span class="skb-badge-req">REQUIRED</span>
        </div>
        <div class="skb-bk-body">
          <div class="skb-slider-group">
            <div class="skb-slider-top">
              <label class="skb-lbl">WAIT</label>
              <div class="skb-val-badge"><span id="skbCdDisplay">0</span><span class="skb-unit">T</span></div>
            </div>
            <input class="skb-range" type="range" id="skbCdRange" min="0" max="5" value="0" />
            <div class="skb-range-ticks"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
          </div>
          <div class="skb-hint-line" id="skbCdHint">No cooldown — usable every turn.</div>
        </div>
      </div>

    </div>

    <div class="skb-sidebar">

      <div class="skb-section-lbl">// PREVIEW //</div>
      <div id="skbPreview" class="skb-preview-area">
        <div class="skb-preview-ph">Configure blocks to see preview...</div>
      </div>

      <div class="skb-forge-area">
        <div class="skb-valid-line" id="skbValidLine"></div>
        <button class="skb-forge-btn" id="skbForge" type="button" disabled>
          <span class="skb-forge-glyph">⚙</span>
          <span class="skb-forge-text">FORGE SKILL</span>
        </button>
        <div class="skb-err-line" id="skbErrLine"></div>
      </div>

    </div>

  </div>
</div>`;
    document.body.appendChild(div);
  }

  function readState() {
    const v   = id => { const el = g(id); return el ? el.value : ''; };
    const chk = id => { const el = g(id); return el ? el.checked : false; };
    st.name        = v('skbName');
    st.description = v('skbDesc');
    st.scaling     = v('skbScaling');
    st.energyCost  = Math.max(0, Math.min(50, parseInt(v('skbCostRange'))  || 0));
    st.dmgEnabled  = chk('skbDmgToggle');
    st.dmgMin      = Math.max(1, Math.min(999, parseInt(v('skbDmgMin'))   || 1));
    st.dmgMax      = Math.max(1, Math.min(999, parseInt(v('skbDmgMax'))   || 1));
    st.stEnabled   = chk('skbStToggle');
    
    // Check which mode is active
    const advancedMode = g('skbAdvancedMode')?.style.display !== 'none';
    const simpleMode = g('skbSimpleMode')?.style.display !== 'none';
    
    if (advancedMode && st.stEnabled) {
      // Advanced mode
      st.customEffectEnabled = true;
      st.customEffectName = v('skbCustomEffectName');
      st.customEffectDescription = v('skbCustomEffectDesc');
      st.customEffectDuration = Math.max(1, Math.min(10, parseInt(v('skbCustomEffectDuration')) || 3));
      st.customEffectIcon = v('skbCustomEffectIcon') || '⚡';
      st.actionBlocks = collectActionBlocks();
    } else {
      // Simple mode
      st.customEffectEnabled = false;
      st.stName      = v('skbStName');
      st.stType      = v('skbStType') || 'dot';
      st.stDuration  = Math.max(1, Math.min(10, parseInt(v('skbStDuration'))|| 1));
      st.stValue     = Math.max(0, Math.min(999, parseInt(v('skbStValue'))  || 0));
      st.stIcon      = v('skbStIcon') || '⚡';
    }
    st.cooldown    = Math.max(0, Math.min(5,  parseInt(v('skbCdRange'))   || 0));
  }

  function buildStatusEffect() {
    const advancedMode = g('skbAdvancedMode')?.style.display !== 'none';
    
    if (advancedMode && st.customEffectEnabled && st.customEffectName.trim()) {
      const actions = collectActionBlocks();
      if (actions.length === 0) return null;
      
      return {
        name: st.customEffectName.trim(),
        description: st.customEffectDescription || `${st.customEffectName} effect.`,
        duration: st.customEffectDuration,
        icon: st.customEffectIcon,
        effects: actions.map(action => ({
          type: action.type,
          ...(action.value !== undefined && { value: action.value }),
          ...(action.delay !== undefined && { delay: action.delay }),
          ...(action.target !== undefined && { target: action.target }),
          ...(action.duration !== undefined && { duration: action.duration }),
          ...(action.newTeam !== undefined && { newTeam: action.newTeam }),
          ...(action.stat !== undefined && { stat: action.stat }),
          ...(action.delta !== undefined && { delta: action.delta }),
          ...(action.percent !== undefined && { percent: action.percent }),
          ...(action.effectName !== undefined && { effectName: action.effectName }),
          ...(action.radius !== undefined && { radius: action.radius }),
          ...(action.damageType !== undefined && { damageType: action.damageType }),
          ...(action.oldSkillName !== undefined && { oldSkillName: action.oldSkillName }),
          ...(action.newSkillName !== undefined && { newSkillName: action.newSkillName }),
        })),
      };
    }
    
    // Simple mode
    if (st.stEnabled && st.stName.trim()) {
      return {
        name: st.stName.trim(),
        type: st.stType,
        duration: st.stDuration,
        value: st.stType === 'skip' ? 0 : st.stValue,
        icon: st.stIcon || '⚡',
      };
    }
    return null;
  }

  function buildSkill() {
    readState();
    const mn = Math.min(st.dmgMin, st.dmgMax);
    const mx = Math.max(st.dmgMin, st.dmgMax);
    let allEffects = [];
    if (st.stEnabled && st.stName.trim()) {
      allEffects.push({
        name: st.stName.trim(),
        type: st.stType,
        duration: st.stDuration,
        value: st.stType === 'skip' ? 0 : st.stValue,
        icon: st.stIcon || '⚡',
      });
    }
    allEffects.push(...attachedEffects);
    const statusEffects = allEffects.length ? allEffects : null;
    
    return {
      name:          st.name.trim(),
      description:   st.description.trim(),
      damage:        st.dmgEnabled ? [mn, mx] : null,
      energyCost:    st.energyCost,
      cooldown:      st.cooldown,
      statScaling:   st.scaling || null,
      statusEffects: statusEffects,
      currentCooldown: 0,
    };
  }

  function validate(skill) {
    if (!skill.name)        return { ok: false, msg: 'SKILL NAME REQUIRED' };
    if (skill.name.length < 2) return { ok: false, msg: 'NAME TOO SHORT' };
    if (typeof State !== 'undefined' && Array.isArray(State.skills)) {
      if (State.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase())) {
        return { ok: false, msg: `"${skill.name.toUpperCase()}" ALREADY EXISTS` };
      }
    }
    if (!skill.damage && !skill.statusEffect)
      return { ok: false, msg: 'ENABLE DAMAGE AND/OR A STATUS EFFECT' };
    if (skill.damage && skill.damage[0] < 1)
      return { ok: false, msg: 'MIN DAMAGE MUST BE ≥ 1' };
    if (skill.statusEffect) {
      if (!skill.statusEffect.name)
        return { ok: false, msg: 'STATUS EFFECT NEEDS A NAME' };
      if (skill.statusEffect.type === 'buff' && skill.statusEffect.value <= 0)
        return { ok: false, msg: 'ENERGY BUFF VALUE MUST BE > 0' };
    }
    return { ok: true, msg: '✓ VALID — READY TO FORGE' };
  }

  function updateDmgVis() {
    const fillEl  = g('skbDmgFill');
    const labelEl = g('skbDmgLabel');
    if (!fillEl) return;
    const mn = Math.min(st.dmgMin, st.dmgMax);
    const mx = Math.max(st.dmgMin, st.dmgMax);
    const scale = 100;
    const left  = Math.max(0, Math.min(75, (mn / scale) * 100));
    const width = Math.max(8, Math.min(100 - left, ((mx - mn + 5) / scale) * 100));
    fillEl.style.left  = left + '%';
    fillEl.style.width = width + '%';
    if (labelEl) labelEl.textContent = `${mn} – ${mx} damage per hit`;
  }

  function updateStatusType() {
    // For simple mode only
    const info = statusTypeInfo[st.stType] || statusTypeInfo.dot;
    const descEl = g('skbTypeDesc');
    const valHint = g('skbValHint');
    const valLbl  = g('skbValLbl');
    const valIn   = g('skbStValue');
    if (descEl) descEl.textContent = info.desc;
    if (valHint) valHint.textContent = ` (${info.valueHint})`;
    if (valLbl) {
      // Clear and rebuild the label text to avoid text node issues
      valLbl.innerHTML = '';
      valLbl.appendChild(document.createTextNode(info.valueLabel));
      const hintSpan = document.createElement('span');
      hintSpan.className = 'skb-unit-hint';
      hintSpan.id = 'skbValHint';
      hintSpan.textContent = ` (${info.valueHint})`;
      valLbl.appendChild(hintSpan);
    }
    if (valIn) {
      if (st.stType === 'skip') {
        valIn.value = '0';
        valIn.disabled = true;
        valIn.style.opacity = '0.35';
      } else {
        valIn.disabled = false;
        valIn.style.opacity = '';
      }
    }
  }

  function renderPreview() {
    const prevEl = g('skbPreview');
    const validEl = g('skbValidLine');
    const forgeBtn = g('skbForge');
    if (!prevEl) return;

    const skill = buildSkill();
    const v = validate(skill);

    if (forgeBtn) forgeBtn.disabled = !v.ok;
    if (validEl) {
      validEl.textContent = v.msg;
      validEl.className = 'skb-valid-line ' + (v.ok ? 'ok' : 'err');
    }

    const hasContent = skill.name || skill.damage || skill.statusEffect;
    if (!hasContent) {
      prevEl.innerHTML = '<div class="skb-preview-ph">Configure blocks to see preview...</div>';
      return;
    }

    const dmgStr = skill.damage ? `${skill.damage[0]}–${skill.damage[1]}` : '—';
    const scStr  = skill.statScaling ? skill.statScaling.toUpperCase() : null;
    const typeLabels = { dot:'BLEED', skip:'STUN', expose:'EXPOSE', debuff:'DEBUFF', buff:'BUFF', buff_hp:'HEAL' };

    let stHtml = '';
    if (skill.statusEffect) {
      // Check if it's an advanced effect with effects array
      if (skill.statusEffect.effects && skill.statusEffect.effects.length > 0) {
        const actionSummary = skill.statusEffect.effects.map(e => {
          switch(e.type) {
            case 'damage': return `💥 ${e.value} dmg${e.delay ? ` (delay ${e.delay})` : ''}`;
            case 'heal': return `❤️ +${e.value} HP${e.delay ? ` (delay ${e.delay})` : ''}`;
            case 'skip_turn': return `⏸ Stun ${e.duration || 1}T`;
            case 'change_team': return `🔄 Switch to ${e.newTeam}`;
            case 'stat_mod': return `📊 ${e.stat?.toUpperCase()} ${e.delta > 0 ? '+' : ''}${e.delta}`;
            case 'extra_turn': return `⚡ Extra turn`;
            case 'reflect_damage': return `🛡️ Reflect ${e.percent}%`;
            default: return e.type;
          }
        }).join(' → ');
        
        stHtml = `<div class="skb-prev-fx">
          <span class="skb-prev-fx-icon">${skill.statusEffect.icon || '⚡'}</span>
          <div class="skb-prev-fx-info">
            <span class="skb-prev-fx-name">${skill.statusEffect.name}</span>
            <span class="skb-prev-fx-meta">${skill.statusEffect.duration}T · ${actionSummary}</span>
          </div>
        </div>`;
      } else {
        const tl = typeLabels[skill.statusEffect.type] || skill.statusEffect.type.toUpperCase();
        stHtml = `<div class="skb-prev-fx">
          <span class="skb-prev-fx-icon">${skill.statusEffect.icon}</span>
          <div class="skb-prev-fx-info">
            <span class="skb-prev-fx-name">${skill.statusEffect.name}</span>
            <span class="skb-prev-fx-meta">${tl} · ${skill.statusEffect.duration}T · ${skill.statusEffect.value}</span>
          </div>
        </div>`;
      }
    }

    prevEl.innerHTML = `<div class="skb-prev-card">
      <div class="skb-prev-top">
        <span class="skb-prev-name">${skill.name || '[ UNNAMED ]'}</span>
        ${scStr ? `<span class="skb-prev-scale">${scStr}</span>` : ''}
      </div>
      <div class="skb-prev-desc">${skill.description || '<em style="opacity:.4">No description.</em>'}</div>
      <div class="skb-prev-stats">
        <div class="skb-prev-stat">
          <span class="skb-ps-lbl">DMG</span>
          <span class="skb-ps-val ${dmgStr !== '—' ? 'lit' : ''}">${dmgStr}</span>
        </div>
        <div class="skb-prev-stat">
          <span class="skb-ps-lbl">COST</span>
          <span class="skb-ps-val lit">${skill.energyCost}E</span>
        </div>
        <div class="skb-prev-stat">
          <span class="skb-ps-lbl">CD</span>
          <span class="skb-ps-val ${skill.cooldown > 0 ? 'lit' : ''}">${skill.cooldown}T</span>
        </div>
        <div class="skb-prev-stat">
          <span class="skb-ps-lbl">FX</span>
          <span class="skb-ps-val ${skill.statusEffect ? 'lit fx' : ''}">
            ${skill.statusEffect ? (skill.statusEffect.effects ? 'CUSTOM' : (typeLabels[skill.statusEffect.type] || 'FX')) : '—'}
          </span>
        </div>
      </div>
      ${stHtml}
      <div class="skb-prev-scanline"></div>
    </div>`;
  }

  function onChange() {
    readState();

    // cost
    const costD = g('skbCostDisplay');
    if (costD) costD.textContent = st.energyCost;
    const costH = g('skbCostHint');
    if (costH) {
      const found = costHints.find(([mn, mx]) => st.energyCost >= mn && st.energyCost <= mx);
      costH.textContent = found ? found[2] : '';
    }

    // cooldown
    const cdD = g('skbCdDisplay');
    if (cdD) cdD.textContent = st.cooldown;
    const cdH = g('skbCdHint');
    if (cdH) cdH.textContent = cdHints[st.cooldown] || '';

    // damage block
    const dmgBody = g('skbDmgBody');
    const dmgTxt  = g('skbDmgTxt');
    const dmgBlock = g('skbBlockDmg');
    if (dmgBody)  dmgBody.classList.toggle('open', st.dmgEnabled);
    if (dmgTxt) {
      dmgTxt.textContent = st.dmgEnabled ? 'ON' : 'OFF';
      dmgTxt.style.color = st.dmgEnabled ? 'var(--green)' : 'var(--text-lo)';
    }
    if (dmgBlock) dmgBlock.classList.toggle('active', st.dmgEnabled);
    updateDmgVis();

    // status block
    const stBody  = g('skbStBody');
    const stTxt   = g('skbStTxt');
    const stBlock = g('skbBlockSt');
    if (stBody)  stBody.classList.toggle('open', st.stEnabled);
    if (stTxt) {
      stTxt.textContent = st.stEnabled ? 'ON' : 'OFF';
      stTxt.style.color = st.stEnabled ? 'var(--green)' : 'var(--text-lo)';
    }
    if (stBlock) stBlock.classList.toggle('active', st.stEnabled);
    
    // Update simple mode UI if visible
    if (g('skbStType')) updateStatusType();

    renderPreview();
  }

  let clipboardActions = null;

  function bindEvents() {
    const closeBtn = g('skbClose');
    if (closeBtn) closeBtn.onclick = close;

    // REMOVE the click-outside-to-close behavior
    // Just keep the overlay click handler removed
    const ov = g('skbOverlay');
    if (ov) {
      // Don't add any click handler for closing
      // Just prevent any accidental drag closing
      ov.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });
    }

    const forgeBtn = g('skbForge');
    if (forgeBtn) forgeBtn.onclick = forge;

    // Prevent drag on all elements
    const allElements = document.querySelectorAll('#skbOverlay *');
    allElements.forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });
    });

    // Mode switching
    const simpleBtn = g('skbEffectSimpleBtn');
    const advancedBtn = g('skbEffectAdvancedBtn');
    const simpleMode = g('skbSimpleMode');
    const advancedMode = g('skbAdvancedMode');
    
    if (simpleBtn && advancedBtn && simpleMode && advancedMode) {
      simpleBtn.addEventListener('click', () => {
        simpleMode.style.display = 'block';
        advancedMode.style.display = 'none';
        simpleBtn.style.background = 'var(--green-lo)';
        simpleBtn.style.borderColor = 'var(--green)';
        advancedBtn.style.background = 'var(--bg)';
        advancedBtn.style.borderColor = 'var(--border)';
        onChange();
      });
      
      advancedBtn.addEventListener('click', () => {
        simpleMode.style.display = 'none';
        advancedMode.style.display = 'block';
        advancedBtn.style.background = 'var(--green-lo)';
        advancedBtn.style.borderColor = 'var(--green)';
        simpleBtn.style.background = 'var(--bg)';
        simpleBtn.style.borderColor = 'var(--border)';
        renderActionBlocks();
        onChange();
      });
    }
    
    // Add action button
    const addBtn = g('skbAddActionBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        actionBlocks.push({
          type: 'damage',
          delay: 0,
          target: 'enemy',
          value: 10,
        });
        renderActionBlocks();
        onChange();
      });
    }
    
    // Copy all actions
    const copyBtn = g('skbCopyActionsBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        clipboardActions = JSON.parse(JSON.stringify(actionBlocks));
        if (typeof Ui !== 'undefined') {
          Ui.addInstant('Actions copied to clipboard!', 'system');
        }
      });
    }
    
    // Paste actions
    const pasteBtn = g('skbPasteActionsBtn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', () => {
        if (clipboardActions && clipboardActions.length) {
          actionBlocks.push(...JSON.parse(JSON.stringify(clipboardActions)));
          renderActionBlocks();
          onChange();
          if (typeof Ui !== 'undefined') {
            Ui.addInstant('Actions pasted!', 'system');
          }
        } else {
          if (typeof Ui !== 'undefined') {
            Ui.addInstant('Nothing to paste.', 'system');
          }
        }
      });
    }

    const ids = [
      'skbName','skbDesc','skbScaling',
      'skbCostRange',
      'skbDmgToggle','skbDmgMin','skbDmgMax',
      'skbStToggle','skbStName','skbStType','skbStDuration','skbStValue','skbStIcon',
      'skbCustomEffectName','skbCustomEffectDesc','skbCustomEffectDuration','skbCustomEffectIcon',
      'skbCdRange',
    ];
    ids.forEach(id => {
      const el = g(id);
      if (!el) return;
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });

    const iconGrid = document.querySelector('#skbOverlay .skb-icon-grid');
    if (iconGrid) {
      iconGrid.addEventListener('click', e => {
        const btn = e.target.closest('.skb-icon-btn');
        if (!btn) return;
        const inp = g('skbStIcon');
        if (inp) { inp.value = btn.dataset.icon; onChange(); }
        
        const customIcon = g('skbCustomEffectIcon');
        if (customIcon) {
          const advancedModeDiv = g('skbAdvancedMode');
          if (advancedModeDiv && advancedModeDiv.style.display !== 'none') {
            customIcon.value = btn.dataset.icon;
            onChange();
          }
        }
      });
    }

    document.addEventListener('keydown', onKey);
  }

  function forge() {
    const skill = buildSkill(); // this already builds with attachedEffects
    const v = validate(skill);
    if (!v.ok) { flashErr(v.msg); return; }

    if (editingIndex !== -1) {
      // Replace existing skill
      State.skills[editingIndex] = skill;
      if (typeof Ui !== 'undefined') {
        Ui.addInstant(`[ SKILL UPDATED: ${skill.name.toUpperCase()} ]`, 'system');
      }
    } else {
      State.skills.push(skill);
      if (typeof Ui !== 'undefined') {
        Ui.addInstant(`[ SKILL FORGED: ${skill.name.toUpperCase()} ]`, 'system');
      }
    }
    
    if (typeof addKeyFact === 'function') addKeyFact(`Forged custom skill: ${skill.name}`);
    if (typeof Ui !== 'undefined') Ui.renderSidebar();
    
    const btn = g('skbForge');
    if (btn) {
      btn.innerHTML = '<span class="skb-forge-glyph">✓</span><span class="skb-forge-text">' + (editingIndex !== -1 ? 'UPDATED' : 'FORGED') + '</span>';
      btn.classList.add('success');
    }
    setTimeout(close, 750);
  }

  function flashErr(msg) {
    const el = g('skbErrLine');
    if (!el) return;
    el.textContent = '⚠ ' + msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3500);
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
  }

  // patches renderSkills to inject the forge button
  function init() {
    if (typeof Ui === 'undefined') return;
    const orig = Ui.renderSkills.bind(Ui);
    Ui.renderSkills = function() {
      orig();
      const panel = document.getElementById('tab-skills');
      if (!panel) return;
      // Remove existing button if present to avoid duplicates
      const existing = panel.querySelector('.skb-open-btn');
      if (existing) existing.remove();
      const btn = document.createElement('button');
      btn.className = 'skb-open-btn';
      btn.innerHTML = '<span>⚙</span> FORGE NEW SKILL';
      btn.onclick = () => SkillBuilder.open();
      panel.appendChild(btn);
    };
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open, close };
})();