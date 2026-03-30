const State = {
  hp:             100,
  credits:        0,
  playerClass:    '',
  playerName:     '',
  origin:         '',
  backstory:      '',
  locationDesc:   '',
  tragedy:        null,
  upbringing:     null,
  upbringingRoll: 0,
  traits:         [],
  inventory:      [],
  npcs:           [],
  quests:         [],
  location:       'The Circuit Breaker',
  history:        [],
  gameMinutes:    1320,
  gameDay:        1,
  stats:          { str:4, agi:4, int:4, cha:4, tec:4, end:4 },
  statOverflow:   { str:0, agi:0, int:0, cha:0, tec:0, end:0 },
  statPoints:     0,
  level:          1,
  xp:             0,
  xpToNext:       100,
  maxHp:          100,
  energy:         70,
  maxEnergy:      70,
  skills:         [],
  equipped:       { head:null, body:null, hands:null, back:null },
  keyFacts:       [],

  classBaseHp:    80,
  classBaseEnergy:70,
};

const SAVE_PREFIX = 'ct_save_';

function addKeyFact(fact) {
  if (!State.keyFacts.includes(fact)) {
    State.keyFacts.unshift(fact);
    if (State.keyFacts.length > 30) State.keyFacts.pop();
  }
}

const SaveLoad = {
  slots() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(SAVE_PREFIX))
      .map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch(_) { return null; } })
      .filter(Boolean)
      .sort((a,b) => b.savedAt - a.savedAt);
  },

  save(name) {
    const key = SAVE_PREFIX + name.trim().toLowerCase().replace(/\s+/g,'_');
    const payload = {
      name:     name.trim(),
      savedAt:  Date.now(),
      gameTime: `Day ${State.gameDay} // ${fmtTime(State.gameMinutes)}`,
      snapshot: {
        hp:             State.hp,
        credits:        State.credits,
        playerClass:    State.playerClass,
        playerName:     State.playerName,
        origin:         State.origin,
        backstory:      State.backstory,
        tragedy:        State.tragedy,
        upbringing:     State.upbringing,
        upbringingRoll: State.upbringingRoll,
        traits:         State.traits,
        stats:          State.stats,
        statOverflow:   State.statOverflow,
        statPoints:     State.statPoints,
        level:          State.level,
        xp:             State.xp,
        xpToNext:       State.xpToNext,
        maxHp:          State.maxHp,
        energy:         State.energy,
        maxEnergy:      State.maxEnergy,
        skills:         State.skills,
        inventory:      State.inventory,
        equipped:       State.equipped,
        npcs:           State.npcs,
        quests:         State.quests,
        location:       State.location,
        gameMinutes:    State.gameMinutes,
        gameDay:        State.gameDay,
        history:        State.history,
      },
      log: Array.from(document.querySelectorAll('#narrativeLog .log-entry')).map(el => ({
        cls:  el.className.replace('log-entry ',''),
        text: el.textContent,
      })),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  },

  load(name) {
    const key = SAVE_PREFIX + name.trim().toLowerCase().replace(/\s+/g,'_');
    const raw  = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const payload = JSON.parse(raw);
      const s = payload.snapshot;

      State.hp             = s.hp;
      State.credits        = s.credits;
      State.playerClass    = s.playerClass;
      State.playerName     = s.playerName     || '';
      State.origin         = s.origin         || '';
      State.backstory      = s.backstory      || '';
      State.tragedy        = s.tragedy        || null;
      State.upbringing     = s.upbringing     || null;
      State.upbringingRoll = s.upbringingRoll || 0;
      State.traits         = s.traits         || [];
      State.stats          = s.stats          || { str:4, agi:4, int:4, cha:4, tec:4, end:4 };
      State.statOverflow   = s.statOverflow   || { str:0, agi:0, int:0, cha:0, tec:0, end:0 };
      State.statPoints     = s.statPoints     || 0;
      State.level          = s.level          || 1;
      State.xp             = s.xp             || 0;
      State.xpToNext       = s.xpToNext       || 100;
      State.maxHp          = s.maxHp          || 100;
      State.energy         = s.energy         || 70;
      State.maxEnergy      = s.maxEnergy      || 70;
      State.skills         = (s.skills||[]).map(sk => ({ ...sk, currentCooldown:0 }));
      State.inventory      = s.inventory      || [];
      State.equipped       = s.equipped       || { head:null, body:null, hands:null, back:null };
      State.npcs           = s.npcs           || [];
      State.quests         = s.quests         || [];
      State.location       = s.location;
      State.gameMinutes    = s.gameMinutes;
      State.gameDay        = s.gameDay;
      State.history        = s.history        || [];
      State.keyFacts       = s.keyFacts       || [];

      const log = document.getElementById('narrativeLog');
      log.innerHTML = '';
      (payload.log||[]).forEach(entry => {
        const el = document.createElement('div');
        el.className = 'log-entry ' + entry.cls;
        el.textContent = entry.text;
        log.appendChild(el);
      });
      log.scrollTop = log.scrollHeight;

      Ui.typeQueue = [];
      Ui.isTyping  = false;
      if (Ui.typingTimer) clearTimeout(Ui.typingTimer);

      Ui.showScreen('gameScreen');
      Ui.updateHeader();
      Ui.renderSidebar();
      Ui.setInputLocked(false);
      Ui.addInstant(`[ SYSTEM: GAME LOADED — ${payload.gameTime} ]`, 'system');
      return true;
    } catch(e) {
      console.error('Load error:', e);
      return false;
    }
  },

  delete(name) {
    localStorage.removeItem(SAVE_PREFIX + name.trim().toLowerCase().replace(/\s+/g,'_'));
  },
};

// ─── utilities ────────────────────────────────────────
function fmtTime(mins) {
  const h = String(Math.floor(mins / 60) % 24).padStart(2,'0');
  const m = String(mins % 60).padStart(2,'0');
  return `${h}:${m}`;
}

function capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function advanceTime() {
  State.gameMinutes += 15 + Math.floor(Math.random() * 31);
  if (State.gameMinutes >= 1440) {
    State.gameMinutes -= 1440;
    State.gameDay++;
  }
}

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

function diceClass(n) {
  if (n === 1)  return 'crit-fail';
  if (n <= 5)   return 'fail';
  if (n <= 12)  return 'mid';
  if (n <= 19)  return 'good';
  return 'crit';
}

function diceFace(n) {
  if (n === 1)  return '⚀';
  if (n <= 5)   return '⚁';
  if (n <= 10)  return '⚂';
  if (n <= 15)  return '⚃';
  if (n <= 19)  return '⚄';
  return '⚅';
}

function buildTicker(resp, prevHp, prevCredits, prevNpcs) {
  const chips = [];

  if (typeof resp.hpDelta === 'number' && resp.hpDelta !== 0) {
    const cls  = resp.hpDelta > 0 ? 'pos' : 'neg';
    const sign = resp.hpDelta > 0 ? '+' : '';
    chips.push(`<span class="tick-chip ${cls}"><span class="tick-icon">♥</span>${sign}${resp.hpDelta} HP</span>`);
  }

  if (typeof resp.creditsDelta === 'number' && resp.creditsDelta !== 0) {
    const cls  = resp.creditsDelta > 0 ? 'pos' : 'neg';
    const sign = resp.creditsDelta > 0 ? '+' : '';
    chips.push(`<span class="tick-chip ${cls}"><span class="tick-icon">₵</span>${sign}${resp.creditsDelta} CR</span>`);
  }

  if (resp.newLocation) {
    chips.push(`<span class="tick-chip neu"><span class="tick-icon">◈</span>${resp.newLocation}</span>`);
  }

  if (resp.timeDelta && resp.timeDelta !== 0) {
    const mins = resp.timeDelta;
    let display = '';
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      display = `${hours}h${minutes ? ` ${minutes}m` : ''}`;
    } else {
      display = `${mins} min`;
    }
    chips.push(`<span class="tick-chip time"><span class="tick-icon">⏱</span>+${display}</span>`);
  }

  if (Array.isArray(resp.addItems) && resp.addItems.length) {
    resp.addItems.forEach(i => {
      chips.push(`<span class="tick-chip pos"><span class="tick-icon">+</span>${i.amount||1}× ${capitalize(i.name)}</span>`);
    });
  }

  if (Array.isArray(resp.removeItems) && resp.removeItems.length) {
    resp.removeItems.forEach(i => {
      chips.push(`<span class="tick-chip neg"><span class="tick-icon">−</span>${i.amount||1}× ${capitalize(i.name)}</span>`);
    });
  }

  if (Array.isArray(resp.npcs) && resp.npcs.length) {
    resp.npcs.forEach(n => {
      const prev = prevNpcs.find(x => x.name.toLowerCase() === n.name.toLowerCase());
      if (prev && prev.relationship !== n.relationship) {
        const relCls = { Hostile:'neg', Suspicious:'neg', Friendly:'pos', Ally:'pos', Neutral:'neu' }[n.relationship] || 'neu';
        chips.push(`<span class="tick-chip ${relCls}"><span class="tick-icon">⬡</span>${n.name}: ${prev.relationship} → ${n.relationship}</span>`);
      } else if (!prev) {
        chips.push(`<span class="tick-chip neu"><span class="tick-icon">⬡</span>${n.name} [${n.relationship}]</span>`);
      }
    });
  }

  if (Array.isArray(resp.quests) && resp.quests.length) {
    resp.quests.forEach(q => {
      const title = capitalize(q.title || '');
      const stCls = { complete:'pos', failed:'neg', active:'neu' }[q.status] || 'neu';
      const icon  = { complete:'✔', failed:'✘', active:'◉' }[q.status] || '◉';
      chips.push(`<span class="tick-chip ${stCls}"><span class="tick-icon">${icon}</span>${title}</span>`);
    });
  }

  // ALWAYS show the dice roll if there is one
  let diceChip = '';
  const pendingRv = window.__pendingRoll;
  window.__pendingRoll = null;
  if (pendingRv) {
    const dc = diceClass(pendingRv);
    const df = diceFace(pendingRv);
    diceChip = `<span class="dice-chip ${dc}"><span class="dice-face">${df}</span>d20: ${pendingRv}</span>`;
  } else if (resp.roll && resp.roll !== 'none') {
    const rv = rollD20();
    const dc = diceClass(rv);
    const df = diceFace(rv);
    diceChip = `<span class="dice-chip ${dc}"><span class="dice-face">${df}</span>d20: ${rv}</span>`;
  }

  // Create ticker even if only dice roll exists
  const el = document.createElement('div');
  el.className = 'event-ticker';
  el.innerHTML = chips.join('') + diceChip;
  
  // If there's nothing to show (no chips AND no dice), return null
  if (chips.length === 0 && !diceChip) return null;
  
  return el;
}