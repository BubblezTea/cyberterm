const Ui = {
  typeQueue:  [],
  isTyping:   false,
  typingTimer: null,
  isPageActive: true,

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  initVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      this.isPageActive = !document.hidden;
    });
  },

  enqueue(text, type = 'narrator') {
    if (type === 'narrator' && window.Sound) Sound.narrator();
    this.typeQueue.push({ text, type });
    if (!this.isTyping) this.flushQueue();
  },

  flushQueue() {
    if (!this.typeQueue.length) { this.isTyping = false; return; }
    this.isTyping = true;
    const { text, type } = this.typeQueue.shift();
    this.typeMessage(text, type, () => setTimeout(() => this.flushQueue(), 80));
  },

  typeMessage(text, type, onDone) {
    const log = document.getElementById('narrativeLog');
    const el  = document.createElement('div');
    el.className = `log-entry ${type}`;
    log.appendChild(el);

    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    el.appendChild(cursor);

    const typeNext = () => {
      if (i < text.length) {
        cursor.before(document.createTextNode(text[i++]));
        log.scrollTop = log.scrollHeight;
        if (window.Sound) Sound.typing();
        this.typingTimer = setTimeout(typeNext, 18);
      } else {
        cursor.remove();
        log.scrollTop = log.scrollHeight;
        onDone?.();
      }
    };
    this.typingTimer = setTimeout(typeNext, 18);
  },

  addInstant(text, type = 'player') {
    const log = document.getElementById('narrativeLog');
    const el  = document.createElement('div');
    el.className  = `log-entry ${type}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  },

  updateHeader() {
    document.getElementById('hdrHp').textContent    = State.hp;
    document.getElementById('hdrCr').textContent    = State.credits;
    document.getElementById('hdrLoc').textContent   = State.location;
    document.getElementById('hdrClass').textContent = `CLASS: ${State.playerClass.toUpperCase()}`;
    document.getElementById('hdrClock').textContent = fmtTime(State.gameMinutes);
    document.getElementById('hdrDay').textContent   = `DAY ${State.gameDay}`;
  },

  renderSidebar() {
    this.renderInventory();
    this.renderGear();
    this.renderNpcs();
    this.renderQuests();
    this.renderTrait();
    this.renderStats();
  },

  renderInventory() {
    const panel = document.getElementById('tab-inv');
    if (!State.inventory.length) {
      panel.innerHTML = '<div class="panel-empty">[ EMPTY ]</div>';
      return;
    }

    panel.innerHTML = State.inventory.map(item => {
      const equippedSlot = item.slot
        ? Object.entries(State.equipped).find(([,v]) => v && v.name === item.name)?.[0]
        : null;
      const bonusStr = item.statBonus
        ? Object.entries(item.statBonus).filter(([,v])=>v).map(([k,v])=>`${k.toUpperCase()}+${v}`).join(' ')
        : '';
      const tag = item.slot
        ? `<span class="inv-item-slot">[${item.slot.toUpperCase()}]${bonusStr ? ' '+bonusStr : ''}</span>`
        : '';
      const equippedBadge = equippedSlot
        ? `<span class="inv-item-equipped">EQUIPPED</span>`
        : '';
      const footer = (tag || equippedBadge)
        ? `<div class="inv-item-footer">${tag}${equippedBadge}</div>`
        : '';

      return `<div class="inv-item" data-name="${item.name}">
        <div class="iname">${item.unsellable ? '★ ' : ''}${item.name} <span class="iamt">x${item.amount}</span></div>
        <div class="idesc">${item.description}</div>
        ${footer}
      </div>`;
    }).join('');

    // clicking an item opens the popup
    panel.querySelectorAll('.inv-item').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.name;
        const item = State.inventory.find(i => i.name === name);
        if (item) showItemPopup(item);
      });
    });
  },

  renderGear() {
    const panel    = document.getElementById('tab-gear');
    const slotDefs = [
      { key:'head',  label:'HEAD'  },
      { key:'body',  label:'BODY'  },
      { key:'hands', label:'HANDS' },
      { key:'back',  label:'BACK'  },
    ];

    const totalBonus = {};
    Object.values(State.equipped).forEach(item => {
      if (!item || !item.statBonus) return;
      Object.entries(item.statBonus).forEach(([k,v]) => { if (v) totalBonus[k] = (totalBonus[k]||0)+v; });
    });
    const bonusSummary = Object.entries(totalBonus).length
      ? `<div class="rs-derived" style="margin-bottom:10px">${Object.entries(totalBonus).map(([k,v])=>`<div class="rs-dv">${k.toUpperCase()} <span>+${v}</span></div>`).join('')}</div>`
      : '';

    const slots = slotDefs.map(({ key, label }) => {
      const item = State.equipped[key];
      if (item) {
        const bonusStr = item.statBonus
          ? Object.entries(item.statBonus).filter(([,v])=>v).map(([k,v])=>`${k.toUpperCase()}+${v}`).join(' ')
          : 'no bonus';
        return `<div class="gear-slot">
          <span class="gear-slot-label">${label}</span>
          <div class="gear-slot-content">
            <div class="gear-slot-name">${item.name}</div>
            <div class="gear-slot-bonus">${bonusStr}</div>
          </div>
          <button class="gear-unequip-btn" data-slot="${key}">✕</button>
        </div>`;
      }
      return `<div class="gear-slot">
        <span class="gear-slot-label">${label}</span>
        <span class="gear-slot-empty">— empty —</span>
      </div>`;
    }).join('');

    panel.innerHTML = `${bonusSummary}<div class="gear-slots">${slots}</div>`;

    panel.querySelectorAll('.gear-unequip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        State.equipped[btn.dataset.slot] = null;
        State.maxHp     = StatSystem.calcMaxHp();
        State.maxEnergy = StatSystem.calcMaxEnergy();
        Ui.updateHeader();
        Ui.renderSidebar();
      });
    });
  },

  renderNpcs() {
    const panel    = document.getElementById('tab-npcs');
    const locBadge = `<div class="loc-badge">AREA: <span>${State.location}</span></div>`;
    if (!State.npcs.length) {
      panel.innerHTML = locBadge + '<div class="panel-empty">[ NO CONTACTS ]</div>';
      return;
    }
    panel.innerHTML = locBadge + State.npcs.map(n => `
      <div class="npc-entry">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="npc-name">${n.name}</span>
          <span class="npc-rel rel-${n.relationship}">${n.relationship.toUpperCase()}</span>
        </div>
        ${n.description ? `<div class="npc-desc">${n.description}</div>` : ''}
      </div>`).join('');
  },

  renderQuests() {
    const panel = document.getElementById('tab-quests');
    if (!State.quests.length) {
      panel.innerHTML = '<div class="panel-empty">[ NO ACTIVE QUESTS ]</div>';
      return;
    }
    panel.innerHTML = State.quests.map(q => `
      <div class="quest-entry">
        <div class="qtitle">
          ${q.title}
          <span class="qstatus ${q.status==='active'?'active-q':q.status}">${q.status.toUpperCase()}</span>
        </div>
        <div class="qdesc">${q.description}</div>
      </div>`).join('');
  },

  renderTrait() {
    const panel = document.getElementById('tab-trait');
    if (!State.traits.length) {
      panel.innerHTML = '<div class="panel-empty">[ TRAIT PENDING ]</div>';
      return;
    }
    panel.innerHTML = State.traits.map((t,i) => `
      <div class="trait-card" style="${i>0?'margin-top:10px':''}">
        <div class="trait-label">// ${State.traits.length>1?`TRAIT ${i+1} OF ${State.traits.length}`:'ACTIVE TRAIT'} //</div>
        <div class="trait-name">${t.name}</div>
        <div class="trait-desc">${t.description}</div>
      </div>`).join('');
  },

  renderStats() {
    const panel = document.getElementById('tab-stats');
    if (!panel) return;

    const s       = State.stats;
    const statDefs = [
      { key:'str', label:'STR', color:'#cc2233', desc:'Melee dmg & carry' },
      { key:'agi', label:'AGI', color:'#0099bb', desc:'Dodge & crit chance' },
      { key:'int', label:'INT', color:'#00cc7a', desc:'Hack dmg & energy' },
      { key:'cha', label:'CHA', color:'#cc9900', desc:'Social & intimidate' },
      { key:'tec', label:'TEC', color:'#6633cc', desc:'Tech skills & gadgets' },
      { key:'end', label:'END', color:'#cc4400', desc:'Max HP & resistance' },
    ];

    const xpPct    = Math.round((State.xp / State.xpToNext) * 100);
    const dodgePct = Math.min(40, s.agi*3);
    const critPct  = Math.min(30, Math.floor(s.agi*1.5));
    const dmgBonus = Math.floor(s.str*0.4);

    const statRows = statDefs.map(d => {
      const baseVal  = s[d.key];
      const overflow = State.statOverflow[d.key] || 0;
      const display  = overflow > 0 ? `${baseVal} (+${overflow})` : baseVal;
      const pct      = Math.round((baseVal/10)*100);
      const canUp    = State.statPoints > 0;
      return `<div class="rs-row">
        <span class="rs-label" title="${d.desc}">${d.label}</span>
        <div class="rs-bar"><div class="rs-fill" style="width:${pct}%;background:${d.color}"></div></div>
        <span class="rs-val">${display}</span>
        <button class="rs-plus ${canUp?'':'rs-plus-off'}" data-stat="${d.key}" ${canUp?'':'disabled'}>+</button>
      </div>`;
    }).join('');

    const skillCards = State.skills.length ? State.skills.map(sk => {
      const dmgStr = sk.damage ? `${sk.damage[0]}-${sk.damage[1]}dmg` : 'utility';
      const cdStr  = sk.cooldown > 0 ? ` · ${sk.cooldown}t cd` : '';
      const sfStr  = sk.statusEffect ? ` · ${sk.statusEffect.name}` : '';
      return `<div class="rs-skill">
        <div class="rs-sk-name">${sk.name} <span class="rs-sk-type">${sk.statScaling?sk.statScaling.toUpperCase():''}</span></div>
        <div class="rs-sk-meta">${dmgStr} · ${sk.energyCost}en${cdStr}${sfStr}</div>
        <div class="rs-sk-desc">${sk.description}</div>
      </div>`;
    }).join('') : '<div class="panel-empty">[ NO SKILLS YET ]</div>';

    panel.innerHTML = `
      <div class="rs-level-block">
        <div class="rs-lv-row">
          <span class="rs-lv-label">LV ${State.level}</span>
          <span class="rs-lv-xp">${State.xp} / ${State.xpToNext} XP</span>
        </div>
        <div class="rs-xp-bar"><div class="rs-xp-fill" style="width:${xpPct}%"></div></div>
      </div>
      ${State.statPoints>0?`<div class="rs-sp-banner">${State.statPoints} STAT POINT${State.statPoints>1?'S':''} AVAILABLE</div>`:''}
      <div class="rs-section-label">CORE STATS</div>
      ${statRows}
      <div class="rs-derived">
        <div class="rs-dv">MAX HP <span>${State.maxHp}</span></div>
        <div class="rs-dv">MAX EN <span>${State.maxEnergy}</span></div>
        <div class="rs-dv">DODGE <span>${dodgePct}%</span></div>
        <div class="rs-dv">CRIT <span>${critPct}%</span></div>
        <div class="rs-dv">MELEE+ <span>+${dmgBonus}</span></div>
      </div>
      <div class="rs-section-label" style="margin-top:10px">SKILLS</div>
      ${skillCards}`;

    panel.querySelectorAll('.rs-plus:not(.rs-plus-off)').forEach(btn => {
      btn.addEventListener('click', () => {
        const stat = btn.dataset.stat;
        if (State.statPoints <= 0) return;
        if (State.stats[stat] < 10) State.stats[stat]++;
        else State.statOverflow[stat] = (State.statOverflow[stat]||0)+1;
        State.statPoints--;
        State.maxHp     = StatSystem.calcMaxHp();
        State.hp        = Math.min(State.hp, State.maxHp);
        State.maxEnergy = StatSystem.calcMaxEnergy();
        State.energy    = Math.min(State.energy, State.maxEnergy);
        Ui.updateHeader();
        Ui.renderStats();
      });
    });
  },

  setInputLocked(locked) {
    const input = document.getElementById('playerInput');
    const btn   = document.getElementById('sendBtn');
    input.disabled = locked;
    btn.disabled   = locked;
    if (!locked) input.focus();
  },
};

// ─── item popup ────────────────────────────────────────
function showItemPopup(item) {
  const popup   = document.getElementById('itemPopup');
  const equippedSlot = item.slot
    ? Object.entries(State.equipped).find(([,v]) => v && v.name === item.name)?.[0]
    : null;

  document.getElementById('itemPopupName').textContent   = item.name;
  document.getElementById('itemPopupSlot').textContent   = item.slot ? `[SLOT: ${item.slot.toUpperCase()}]` : '';
  document.getElementById('itemPopupDesc').textContent   = item.description || '—';
  document.getElementById('itemPopupAmount').textContent = `QTY: ${item.amount}`;

  const bonusEl = document.getElementById('itemPopupBonus');
  if (item.statBonus) {
    const parts = Object.entries(item.statBonus).filter(([,v])=>v).map(([k,v])=>`${k.toUpperCase()} +${v}`);
    bonusEl.textContent = parts.length ? parts.join('  ') : '';
  } else {
    bonusEl.textContent = '';
  }

  const actionsEl = document.getElementById('itemPopupActions');
  actionsEl.innerHTML = '';

  if (item.slot) {
    if (equippedSlot) {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'item-popup-unequip-btn';
      unequipBtn.textContent = 'UNEQUIP';
      unequipBtn.addEventListener('click', () => {
        State.equipped[equippedSlot] = null;
        State.maxHp     = StatSystem.calcMaxHp();
        State.maxEnergy = StatSystem.calcMaxEnergy();
        Ui.updateHeader();
        Ui.renderSidebar();
        popup.classList.remove('open');
      });
      actionsEl.appendChild(unequipBtn);
    } else {
      const equipBtn = document.createElement('button');
      equipBtn.className = 'item-popup-equip-btn';
      equipBtn.textContent = 'EQUIP';
      equipBtn.addEventListener('click', () => {
        State.equipped[item.slot] = item;
        State.maxHp     = StatSystem.calcMaxHp();
        State.maxEnergy = StatSystem.calcMaxEnergy();
        Ui.updateHeader();
        Ui.renderSidebar();
        popup.classList.remove('open');
      });
      actionsEl.appendChild(equipBtn);
    }
  }

  // consumable use button
  if (/stim|heal|med|inject|boost|patch|syringe/i.test(item.name) && item.amount > 0) {
    const useBtn = document.createElement('button');
    useBtn.className = 'item-popup-use-btn';
    useBtn.textContent = 'USE';
    useBtn.addEventListener('click', () => {
      const healAmt = 20 + State.stats.tec * 2;
      State.hp = Math.min(State.maxHp, State.hp + healAmt);
      if (window.Sound) Sound.itemUse();
      item.amount--;
      if (item.amount <= 0) {
        const idx = State.inventory.indexOf(item);
        if (idx !== -1) State.inventory.splice(idx, 1);
      }
      Ui.addInstant(`You use ${item.name}: +${healAmt} HP`, 'system');
      Ui.updateHeader();
      Ui.renderSidebar();
      popup.classList.remove('open');
    });
    actionsEl.appendChild(useBtn);
  }

  popup.classList.add('open');
}

// ─── dev console ───────────────────────────────────────
const Console = {
  history: [],
  histIdx: -1,

  log(text, cls='info') {
    const el  = document.createElement('div');
    el.className  = 'con-line ' + cls;
    el.textContent = text;
    const log = document.getElementById('consoleLog');
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  },

  clear() { document.getElementById('consoleLog').innerHTML = ''; },

  exec(raw) {
    const line = raw.trim();
    if (!line) return;
    this.history.unshift(line);
    this.histIdx = -1;
    this.log(line, 'input');
    const parts = line.split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    try { this.dispatch(cmd, parts.slice(1), line); }
    catch(e) { this.log('error: ' + e.message, 'err'); }
    Ui.updateHeader();
    Ui.renderSidebar();
  },

  dispatch(cmd, args, raw) {
    switch(cmd) {
      case 'help':
        this.log('─── stat commands ───────────────────────────', 'header');
        this.log('  give xp <n>             grant XP (may level up)');
        this.log('  give sp <n>             grant stat points');
        this.log('  set stat <key> <n>      set stat (str/agi/int/cha/tec/end)');
        this.log('  set level <n>');
        this.log('  set hp <n>');
        this.log('  set credits <n>');
        this.log('  set location <string>');
        this.log('  set time <HH:MM>');
        this.log('  set day <n>');
        this.log('  heal <n> / damage <n>');
        this.log('  give <n> / take <n>     credits');
        this.log('─── inventory ───────────────────────────────', 'header');
        this.log('  add item <name> <amt> <desc...>');
        this.log('  remove item <name> [amt]');
        this.log('  clear inventory');
        this.log('─── npcs ────────────────────────────────────', 'header');
        this.log('  set npc <name> <Friendly|Neutral|Hostile|Suspicious|Ally>');
        this.log('  remove npc <name>');
        this.log('─── quests ──────────────────────────────────', 'header');
        this.log('  add quest <title> | <description>');
        this.log('  set quest <title> <active|complete|failed>');
        this.log('  remove quest <title>');
        this.log('─── skills ──────────────────────────────────', 'header');
        this.log('  add skill <n>|<desc>|<dMin>-<dMax>|<en>|<cd>');
        this.log('  remove skill <n>');
        this.log('  list skills');
        this.log('─── traits ──────────────────────────────────', 'header');
        this.log('  add trait <name> | <description>   add a second trait (max 2)');
        this.log('  set trait <name> | <description>   overwrite current trait(s)');
        this.log('  remove trait <name>');
        this.log('─── misc ────────────────────────────────────', 'header');
        this.log('  state / clear / inject <text> / refresh');
        break;
      case 'clear': this.clear(); break;
      case 'list':
        if ((args[0]||'').toLowerCase()==='skills') {
          if (!State.skills.length) { this.log('no skills'); break; }
          State.skills.forEach((s,i) => this.log(`${i+1}. ${s.name} | en:${s.energyCost} cd:${s.cooldown}`));
        }
        break;
      case 'state':
        this.log(JSON.stringify({
          hp:State.hp, credits:State.credits, class:State.playerClass,
          location:State.location, level:State.level, xp:State.xp,
          stats:State.stats, inventory:State.inventory, equipped:State.equipped,
          npcs:State.npcs, quests:State.quests,
        }, null, 2), 'info');
        break;
      case 'heal': {
        const n = parseInt(args[0]);
        if (isNaN(n)) { this.log('usage: heal <n>', 'err'); break; }
        State.hp = Math.min(State.maxHp, State.hp + n);
        this.log(`hp +${n} → ${State.hp}`, 'ok');
        break;
      }
      case 'damage': {
        const n = parseInt(args[0]);
        if (isNaN(n)) { this.log('usage: damage <n>', 'err'); break; }
        State.hp = Math.max(0, State.hp - n);
        this.log(`hp -${n} → ${State.hp}`, 'ok');
        break;
      }
      case 'give': {
        const sub = (args[0]||'').toLowerCase();
        if (sub === 'xp') {
          const n = parseInt(args[1]);
          if (isNaN(n)) { this.log('usage: give xp <n>', 'err'); break; }
          StatSystem.gainXp(n); this.log(`+${n} xp`, 'ok');
        } else if (sub === 'sp') {
          const n = parseInt(args[1]);
          if (isNaN(n)) { this.log('usage: give sp <n>', 'err'); break; }
          State.statPoints += n; this.log(`+${n} sp → ${State.statPoints}`, 'ok');
        } else {
          const n = parseInt(args[0]);
          if (isNaN(n)) { this.log('usage: give <n>', 'err'); break; }
          State.credits += n; this.log(`credits +${n} → ${State.credits}`, 'ok');
        }
        break;
      }
      case 'take': {
        const n = parseInt(args[0]);
        if (isNaN(n)) { this.log('usage: take <n>', 'err'); break; }
        State.credits = Math.max(0, State.credits - n);
        this.log(`credits -${n} → ${State.credits}`, 'ok');
        break;
      }
      case 'set':    this.cmdSet(args, raw);    break;
      case 'add':    this.cmdAdd(args, raw);    break;
      case 'remove': this.cmdRemove(args);      break;
      case 'inject': {
        const text = args.join(' ');
        if (!text) { this.log('usage: inject <text>', 'err'); break; }
        Ui.addInstant(text, 'narrator');
        this.log('injected', 'ok');
        break;
      }
      case 'refresh':
        window.refreshLastResponse?.().then(() => this.log('refreshed', 'ok')).catch(e => this.log(e.message, 'err'));
        break;
      default: this.log(`unknown: ${cmd}`, 'err');
    }
  },

  cmdSet(args) {
    const sub = (args[0]||'').toLowerCase();
    switch(sub) {
      case 'hp': {
        const n = parseInt(args[1]);
        if (isNaN(n)) { this.log('usage: set hp <n>', 'err'); break; }
        State.hp = Math.max(0, Math.min(State.maxHp, n));
        this.log(`hp = ${State.hp}`, 'ok'); break;
      }
      case 'credits': {
        const n = parseInt(args[1]);
        if (isNaN(n)) { this.log('usage: set credits <n>', 'err'); break; }
        State.credits = Math.max(0, n);
        this.log(`credits = ${State.credits}`, 'ok'); break;
      }
      case 'stat': {
        const key = (args[1]||'').toLowerCase();
        const n   = parseInt(args[2]);
        if (!['str','agi','int','cha','tec','end'].includes(key)||isNaN(n)) {
          this.log('usage: set stat <key> <n>', 'err'); break;
        }
        State.stats[key] = Math.max(1, Math.min(10, n));
        State.maxHp      = StatSystem.calcMaxHp();
        State.maxEnergy  = StatSystem.calcMaxEnergy();
        this.log(`${key} = ${State.stats[key]}`, 'ok'); break;
      }
      case 'level': {
        const n = parseInt(args[1]);
        if (isNaN(n)||n<1) { this.log('usage: set level <n>', 'err'); break; }
        State.level = n; this.log(`level = ${n}`, 'ok'); break;
      }
      case 'location': {
        const loc = args.slice(1).join(' ');
        if (!loc) { this.log('usage: set location <string>', 'err'); break; }
        State.location = loc; this.log(`location = "${loc}"`, 'ok'); break;
      }
      case 'time': {
        const t = args[1]||'';
        const m = t.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) { this.log('usage: set time HH:MM', 'err'); break; }
        State.gameMinutes = parseInt(m[1])*60+parseInt(m[2]);
        this.log(`time = ${fmtTime(State.gameMinutes)}`, 'ok'); break;
      }
      case 'day': {
        const n = parseInt(args[1]);
        if (isNaN(n)||n<1) { this.log('usage: set day <n>', 'err'); break; }
        State.gameDay = n; this.log(`day = ${n}`, 'ok'); break;
      }
      case 'npc': {
        const validRels = ['Friendly','Neutral','Hostile','Suspicious','Ally'];
        const rel  = args[args.length-1];
        const name = args.slice(1,args.length-1).join(' ');
        if (!name||!validRels.includes(rel)) { this.log(`usage: set npc <n> <rel>`, 'err'); break; }
        const ex = State.npcs.find(n => n.name.toLowerCase()===name.toLowerCase());
        if (ex) ex.relationship = rel;
        else    State.npcs.push({ name, relationship:rel });
        this.log(`npc "${name}" = ${rel}`, 'ok'); break;
      }
      case 'quest': {
        const status = args[args.length-1].toLowerCase();
        const title  = args.slice(1,args.length-1).join(' ');
        if (!title||!['active','complete','failed'].includes(status)) {
          this.log('usage: set quest <title> <status>', 'err'); break;
        }
        const q = State.quests.find(x => x.title.toLowerCase()===title.toLowerCase());
        if (!q) { this.log(`quest not found: "${title}"`, 'err'); break; }
        q.status = status; this.log(`quest "${q.title}" = ${status}`, 'ok'); break;
      }
      case 'trait': {
        // set trait Name | Description (overwrites all traits)
        const rest = raw.replace(/^set\s+trait\s*/i, '');
        const pipe = rest.indexOf('|');
        if (pipe === -1) {
          this.log('usage: set trait <name> | <description>', 'err');
          break;
        }
        const tName = rest.slice(0, pipe).trim();
        const tDesc = rest.slice(pipe + 1).trim();
        if (!tName || !tDesc) {
          this.log('usage: set trait <name> | <description>', 'err');
          break;
        }
        State.traits = [{ name: tName, description: tDesc }];
        this.log(`traits replaced with: "${tName}"`, 'ok');
        break;
      }
      default: this.log(`unknown set target: ${sub}`, 'err');
    }
  },

  cmdAdd(args, raw) {
    const sub = (args[0]||'').toLowerCase();
    if (sub === 'item') {
      const n   = parseInt(args[2]);
      const amt = isNaN(n) ? 1 : n;
      const name = args[1] || '';
      const descStart = isNaN(n) ? 2 : 3;
      const desc = args.slice(descStart).join(' ');
      if (!name) { this.log('usage: add item <name> [amt] <desc...>', 'err'); return; }
      const ex = State.inventory.find(i => i.name.toLowerCase()===name.toLowerCase());
      if (ex) { ex.amount += amt; }
      else    { State.inventory.push({ name:capitalize(name), amount:amt, description:desc, unsellable:false, slot:null, statBonus:null }); }
      this.log(`added ${amt}x ${name}`, 'ok');
    } else if (sub === 'quest') {
      const rest  = raw.replace(/^add\s+quest\s+/i,'');
      const [title,...descParts] = rest.split('|');
      if (!title?.trim()) { this.log('usage: add quest <title> | <description>', 'err'); return; }
      State.quests.push({ title:capitalize(title.trim()), description:descParts.join('|').trim(), status:'active' });
      this.log(`quest added: "${title.trim()}"`, 'ok');
    } else if (sub === 'skill') {
      const rest  = raw.replace(/^add\s+skill\s+/i,'');
      const parts = rest.split('|');
      if (parts.length < 5) { this.log('usage: add skill <n>|<desc>|<dMin>-<dMax>|<en>|<cd>', 'err'); return; }
      const [sname, sdesc, sdmg, sen, scd] = parts;
      const dmgM = sdmg?.match(/(\d+)-(\d+)/);
      const skill = {
        name:        sname?.trim() || 'Skill',
        description: sdesc?.trim() || '',
        damage:      dmgM ? [parseInt(dmgM[1]),parseInt(dmgM[2])] : null,
        energyCost:  parseInt(sen)||0,
        cooldown:    parseInt(scd)||0,
        currentCooldown: 0,
        statScaling: null,
        statusEffect: null,
      };
      State.skills.push(skill);
      this.log(`skill added: "${skill.name}"`, 'ok');
    } else if (sub === 'trait') {
      // add trait Name | Description
      if (State.traits.length >= 2) {
        this.log('already at max traits (2)', 'err');
        return;
      }
      const rest = raw.replace(/^add\s+trait\s*/i, '');
      const pipe = rest.indexOf('|');
      if (pipe === -1) {
        this.log('usage: add trait <name> | <description>', 'err');
        return;
      }
      const tName = rest.slice(0, pipe).trim();
      const tDesc = rest.slice(pipe + 1).trim();
      if (!tName || !tDesc) {
        this.log('usage: add trait <name> | <description>', 'err');
        return;
      }
      State.traits.push({ name: tName, description: tDesc });
      this.log(`trait added: "${tName}" (${State.traits.length}/2)`, 'ok');
      
    } else {
      this.log(`unknown add target: ${sub}`, 'err');
    }
  },

  cmdRemove(args) {
    const sub = (args[0]||'').toLowerCase();
    if (sub === 'item') {
      const name = args.slice(1, args.length - (isNaN(parseInt(args[args.length-1])) ? 0 : 1)).join(' ') || args[1];
      const amt  = isNaN(parseInt(args[args.length-1])) ? 1 : parseInt(args[args.length-1]);
      const idx  = State.inventory.findIndex(i => i.name.toLowerCase()===name.toLowerCase());
      if (idx===-1) { this.log(`item not found: "${name}"`, 'err'); return; }
      State.inventory[idx].amount -= amt;
      if (State.inventory[idx].amount <= 0) State.inventory.splice(idx,1);
      this.log(`removed ${amt}x ${name}`, 'ok');
    } else if (sub === 'npc') {
      const name = args.slice(1).join(' ');
      const idx  = State.npcs.findIndex(n => n.name.toLowerCase()===name.toLowerCase());
      if (idx===-1) { this.log(`npc not found: "${name}"`, 'err'); return; }
      State.npcs.splice(idx,1); this.log(`removed npc "${name}"`, 'ok');
    } else if (sub === 'quest') {
      const title = args.slice(1).join(' ');
      const idx   = State.quests.findIndex(q => q.title.toLowerCase()===title.toLowerCase());
      if (idx===-1) { this.log(`quest not found: "${title}"`, 'err'); return; }
      State.quests.splice(idx,1); this.log(`removed quest "${title}"`, 'ok');
    } else if (sub === 'skill') {
      const sname = args.slice(1).join(' ');
      const idx   = State.skills.findIndex(s => s.name.toLowerCase()===sname.toLowerCase());
      if (idx===-1) { this.log(`skill not found: "${sname}"`, 'err'); return; }
      State.skills.splice(idx,1); this.log(`removed skill "${sname}"`, 'ok');
    } else if (sub === 'inventory') {
      State.inventory = []; this.log('inventory cleared', 'ok');
    } else if (sub === 'trait') {
      const name = args.slice(1).join(' ');
      if (!name) {
        this.log('usage: remove trait <name>', 'err');
        return;
      }
      const idx = State.traits.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
      if (idx === -1) {
        this.log(`trait not found: "${name}"`, 'err');
        return;
      }
      State.traits.splice(idx, 1);
  this.log(`removed trait "${name}"`, 'ok');
    } else {
      this.log(`unknown remove target: ${sub}`, 'err');
    }
  },
};
