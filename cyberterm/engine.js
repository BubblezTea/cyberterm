function generateDefaultSkills() {
  const cl = State.playerClass.toLowerCase();
  if (cl.includes('netrunner') || cl.includes('hacker')) return [
    { name:'Data Spike',   description:'Quick hack, deals small damage.',     damage:[6,12],  energyCost:8,  cooldown:0, currentCooldown:0, statScaling:'int', statusEffect:null },
    { name:'Overclock',    description:'Boost next action, gain +10 energy.', damage:null,    energyCost:5,  cooldown:2, currentCooldown:0, statScaling:null,  statusEffect:{ name:'Overclocked', type:'buff', duration:1, value:10, icon:'⚡' } },
    { name:'System Crash', description:'Heavy single-target damage.',          damage:[12,20], energyCost:15, cooldown:2, currentCooldown:0, statScaling:'int', statusEffect:null },
  ];
  if (cl.includes('merc') || cl.includes('street') || cl.includes('combat')) return [
    { name:'Blade Slash',     description:'Sharp, precise cut.',  damage:[8,14],  energyCost:6,  cooldown:0, currentCooldown:0, statScaling:'str', statusEffect:null },
    { name:'Heavy Blow',      description:'Crushing strike.',     damage:[10,18], energyCost:10, cooldown:1, currentCooldown:0, statScaling:'str', statusEffect:null },
    { name:'Adrenaline Rush', description:'Heal 15 HP.',          damage:null,    energyCost:12, cooldown:3, currentCooldown:0, statScaling:null,  statusEffect:{ name:'Healing', type:'buff_hp', duration:1, value:15, icon:'❤️' } },
  ];
  if (cl.includes('fixer') || cl.includes('social')) return [
    { name:'Dirty Trick',   description:'Confuse enemy, reduce accuracy.', damage:[4,8],  energyCost:6,  cooldown:1, currentCooldown:0, statScaling:'cha', statusEffect:{ name:'Confused', type:'debuff', duration:2, value:2, icon:'🌀' } },
    { name:'Network Bribe', description:'Stun enemy for 1 turn.',          damage:null,   energyCost:10, cooldown:3, currentCooldown:0, statScaling:'cha', statusEffect:{ name:'Stunned', type:'skip', duration:1, value:0, icon:'💀' } },
    { name:'Fast Talk',     description:'Small damage and energy drain.',   damage:[6,10], energyCost:8,  cooldown:0, currentCooldown:0, statScaling:'cha', statusEffect:null },
  ];
  return [
    { name:'Punch', description:'Quick strike.',    damage:[5,10], energyCost:5, cooldown:0, currentCooldown:0, statScaling:'str', statusEffect:null },
    { name:'Kick',  description:'Stronger blow.',   damage:[7,13], energyCost:8, cooldown:0, currentCooldown:0, statScaling:'str', statusEffect:null },
    { name:'Focus', description:'Recover 15 energy.', damage:null, energyCost:0, cooldown:2, currentCooldown:0, statScaling:null,  statusEffect:{ name:'Energy Surge', type:'buff', duration:1, value:15, icon:'🔋' } },
  ];
}

const Engine = {
  applyResponse(resp) {
    if (!resp) return;

    const rawTraits = resp.traits || (resp.trait ? [resp.trait] : []);
    if (rawTraits.length && !State.traits.length) {
      State.traits = rawTraits.map(t => {
        const parts = t.split('||');
        return { name: parts[0]?.trim() || 'Unknown', description: parts[1]?.trim() || t };
      });
    }

    if (typeof resp.hpDelta      === 'number') State.hp      = Math.max(0, Math.min(State.maxHp, State.hp + resp.hpDelta));
    if (typeof resp.creditsDelta === 'number') State.credits = Math.max(0, State.credits + resp.creditsDelta);
    if (resp.newLocation) State.location = resp.newLocation;
    if (resp.newSkill && resp.newSkill.name) {
      const exists = State.skills.find(s => s.name.toLowerCase() === resp.newSkill.name.toLowerCase());
      if (!exists) State.skills.push({ ...resp.newSkill, currentCooldown:0 });
    }

    if (Array.isArray(resp.addItems)) {
      resp.addItems.forEach(item => {
        const name     = capitalize(item.name || '');
        const existing = State.inventory.find(i => i.name === name);
        if (existing) {
          existing.amount = (existing.amount || 1) + (item.amount || 1);
          if (item.description) existing.description = item.description;
        } else {
          State.inventory.push({
            name, amount: item.amount || 1, description: item.description || '',
            unsellable: item.unsellable || false,
            slot:       item.slot      || null,
            statBonus:  item.statBonus || null,
          });
        }
      });
    }

    if (Array.isArray(resp.removeItems)) {
      resp.removeItems.forEach(item => {
        const name = capitalize(item.name || '');
        const idx  = State.inventory.findIndex(i => i.name === name);
        if (idx !== -1) {
          State.inventory[idx].amount -= (item.amount || 1);
          if (State.inventory[idx].amount <= 0) State.inventory.splice(idx, 1);
        }
      });
    }

    if (Array.isArray(resp.npcs)) {
      resp.npcs.forEach(n => {
        const ex = State.npcs.find(x => x.name.toLowerCase() === n.name.toLowerCase());
        if (ex) ex.relationship = n.relationship;
        else    State.npcs.push({ name: n.name, relationship: n.relationship });
      });
    }

    if (Array.isArray(resp.quests)) {
      resp.quests.forEach(q => {
        const title = capitalize(q.title || '');
        const ex    = State.quests.find(x => x.title.toLowerCase() === title.toLowerCase());
        if (ex) {
          if (q.description) ex.description = q.description;
          if (q.status)      ex.status      = q.status;
        } else {
          State.quests.push({ title, description: q.description || '', status: q.status || 'active' });
        }
      });
    }

    if (resp.initialStats && !State.skills.length) {
      const s = resp.initialStats;
      ['str','agi','int','cha','tec','end'].forEach(k => {
        if (typeof s[k] === 'number') State.stats[k] = Math.max(1, Math.min(10, s[k]));
      });
      State.maxHp     = StatSystem.calcMaxHp();
      State.hp        = State.maxHp;
      State.maxEnergy = StatSystem.calcMaxEnergy();
      State.energy    = State.maxEnergy;
    }

    if (!State.skills.length && Object.values(State.stats).every(v => v === 4)) {
      const cl = State.playerClass.toLowerCase();
      State.stats = cl.includes('netrunner') || cl.includes('hacker') ? { str:2, agi:4, int:9, cha:3, tec:6, end:4 }
                  : cl.includes('merc')      || cl.includes('street')  ? { str:9, agi:5, int:2, cha:2, tec:4, end:6 }
                  : cl.includes('fixer')     || cl.includes('social')  ? { str:3, agi:4, int:4, cha:9, tec:4, end:4 }
                  : { str:6, agi:5, int:5, cha:4, tec:4, end:4 };
      State.maxHp     = StatSystem.calcMaxHp();
      State.hp        = State.maxHp;
      State.maxEnergy = StatSystem.calcMaxEnergy();
      State.energy    = State.maxEnergy;
      if (!State.skills.length) State.skills = generateDefaultSkills();
      Ui.addInstant('[SYSTEM: STATS INITIALIZED FROM CLASS ARCHETYPE]', 'system');
    }

    if (Array.isArray(resp.initialSkills) && !State.skills.length) {
      const valid = resp.initialSkills.filter(sk => sk && typeof sk.name === 'string' && sk.name.trim());
      if (valid.length) State.skills = valid.map(sk => ({ ...sk, currentCooldown:0 }));
    }

    if (!State.skills.length) {
      console.warn('No skills from AI, generating defaults.');
      State.skills = generateDefaultSkills();
    }

    if (typeof resp.xpGain === 'number' && resp.xpGain > 0) StatSystem.gainXp(resp.xpGain);

    if (typeof resp.timeAdvance === 'number' && resp.timeAdvance > 0) {
      const oldMinutes = State.gameMinutes;
      const oldDay = State.gameDay;
      let newMinutes = oldMinutes + resp.timeAdvance;
      let dayDelta = 0;
      while (newMinutes >= 1440) {
        newMinutes -= 1440;
        dayDelta++;
      }
      State.gameMinutes = newMinutes;
      State.gameDay += dayDelta;
      const timeChange = resp.timeAdvance; // positive
      resp.timeDelta = timeChange; // store for ticker
    }

    if (resp.newSkill && resp.newSkill.name) {
      const exists = State.skills.find(s => s.name.toLowerCase() === resp.newSkill.name.toLowerCase());
      if (!exists) State.skills.push({ ...resp.newSkill, currentCooldown:0 });
    }

    if (resp.combat && resp.combat.enemy) Engine.pendingCombat = resp.combat;
  },

  pendingCombat: null,
};

const StatSystem = {
  getEquipBonus(stat) {
    return Object.values(State.equipped).reduce((sum, item) => {
      if (!item || !item.statBonus) return sum;
      return sum + (item.statBonus[stat] || 0);
    }, 0);
  },
  calcMaxHp()     { return 40 + (State.stats.end + this.getEquipBonus('end')) * 8; },
  calcMaxEnergy() { return 40 + (State.stats.int + this.getEquipBonus('int')) * 5; },

  gainXp(amount) {
    State.xp += amount;
    const log  = document.getElementById('narrativeLog');
    const xpEl = document.createElement('div');
    xpEl.className = 'log-entry system';
    xpEl.textContent = `[ +${amount} XP ]`;
    if (log) log.appendChild(xpEl);

    while (State.xp >= State.xpToNext) {
      State.xp      -= State.xpToNext;
      State.level++;
      if (window.Sound) Sound.levelUp();
      State.xpToNext   = Math.floor(State.xpToNext * 1.4);
      State.statPoints += 3;
      State.maxHp      += 5;
      State.hp          = Math.min(State.hp + 10, State.maxHp);
      State.maxEnergy  += 3;
      const lvEl = document.createElement('div');
      lvEl.className   = 'log-entry system';
      lvEl.textContent = `[ LEVEL UP → LV ${State.level} · +3 STAT POINTS ]`;
      if (log) { log.appendChild(lvEl); log.scrollTop = 999999; }
    }
    Ui.updateHeader();
    Ui.renderSidebar();
  },
};
