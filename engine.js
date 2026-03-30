function isValidSkill(sk) {
  if (!sk || typeof sk.name !== 'string' || !sk.name.trim()) return false;
  const hasDamage = Array.isArray(sk.damage) && sk.damage[0] >= 1;
  const hasStatus = sk.statusEffect && sk.statusEffect.name && (
    sk.statusEffect.type === 'dot' ||
    sk.statusEffect.type === 'skip' ||
    sk.statusEffect.type === 'expose' ||
    sk.statusEffect.type === 'debuff' ||
    sk.statusEffect.type === 'buff_hp' ||
    (sk.statusEffect.type === 'buff' && typeof sk.statusEffect.value === 'number' && sk.statusEffect.value > 0)
  );
  return hasDamage || hasStatus;
}

function genericName(name) {
  const generic = ['bar patron', 'customer', 'stranger', 'citizen', 'guard', 'civilian', 'bystander'];
  return generic.some(g => name.toLowerCase().includes(g));
}

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

    // --- COMBAT TRIGGER - MUST BE FIRST ---
    if (resp.combat) {
      console.log('[ENGINE] Combat detected!', resp.combat);
      this.pendingCombat = resp.combat;
    }

    if (resp.gui) {
      this.pendingGui = resp.gui;
    }

    if (resp.gui && resp.narration) {
      console.warn('[ENGINE] Stripping narration because gui is present');
      delete resp.narration;
    }

    const rawTraits = resp.traits || (resp.trait ? [resp.trait] : []);
    if (rawTraits.length && !State.traits.length) {
      State.traits = rawTraits.map(t => {
        const parts = t.split('||');
        return { name: parts[0]?.trim() || 'Unknown', description: parts[1]?.trim() || t };
      });
    }

    if (resp.keyFacts && Array.isArray(resp.keyFacts)) {
      resp.keyFacts.forEach(fact => {
        if (typeof fact === 'string' && fact.trim()) {
          addKeyFact(fact.trim());
        }
      });
    }

    if (resp.statDelta) {
      const delta = resp.statDelta;
      let changed = false;
      for (const [stat, change] of Object.entries(delta)) {
        if (['str', 'agi', 'int', 'cha', 'tec', 'end'].includes(stat) && typeof change === 'number') {
          const oldVal = State.stats[stat];
          let newVal = oldVal + change;
          newVal = Math.max(1, Math.min(100, newVal));
          if (newVal !== oldVal) {
            State.stats[stat] = newVal;
            changed = true;
            Ui.addInstant(`[ ${stat.toUpperCase()} ${change > 0 ? '+' : ''}${change} ]`, 'system');
          }
        }
      }
      if (changed) {
        // Recalculate derived stats
        State.maxHp = StatSystem.calcMaxHp();
        State.hp = Math.min(State.hp, State.maxHp);
        State.maxEnergy = StatSystem.calcMaxEnergy();
        State.energy = Math.min(State.energy, State.maxEnergy);
        Ui.updateHeader();
        Ui.renderSidebar();
      }
    }

    if (typeof resp.hpDelta      === 'number') State.hp      = Math.max(0, Math.min(State.maxHp, State.hp + resp.hpDelta));
    if (State.hp <= 0) {
      showDeathScreen(resp.deathReason || 'You succumbed to your injuries.');
      return; // stop further processing
    }
    if (typeof resp.creditsDelta === 'number') {
      let newCredits = State.credits + resp.creditsDelta;
      if (newCredits < 0) {
        console.warn(`Blocked creditsDelta: would leave ${newCredits} credits`);
        Ui.addInstant(`[ INSUFFICIENT CREDITS ]`, 'system');
        resp.creditsDelta = 0; // cancel the transaction
      } else {
        State.credits = newCredits;
      }
    }
    if (resp.newLocation) State.location = resp.newLocation;
    if (resp.newSkills && Array.isArray(resp.newSkills)) {
      resp.newSkills.forEach(skill => {
        if (skill.name && isValidSkill(skill)) {
          const exists = State.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase());
          if (!exists) {
            State.skills.push({ ...skill, currentCooldown: 0 });
            addKeyFact(`Learned new skill: ${skill.name}`);
            Ui.addInstant(`[ LEARNED: ${skill.name} ]`, 'system');
          }
        } else if (skill.name) {
          console.warn('Rejected invalid skill:', skill.name);
          Ui.addInstant(`[ SYSTEM: skill "${skill.name}" rejected — no combat value ]`, 'system');
        }
      });
    } else if (resp.newSkill && resp.newSkill.name && isValidSkill(resp.newSkill)) {
      const exists = State.skills.find(s => s.name.toLowerCase() === resp.newSkill.name.toLowerCase());
      if (!exists) {
        State.skills.push({ ...resp.newSkill, currentCooldown: 0 });
        addKeyFact(`Learned new skill: ${resp.newSkill.name}`);
        Ui.addInstant(`[ LEARNED: ${resp.newSkill.name} ]`, 'system');
      }
    }

    // trade gate: if this looks like a trade, verify player has everything before granting anything
    if (Array.isArray(resp.addItems) && resp.addItems.length && Array.isArray(resp.removeItems) && resp.removeItems.length) {
      const canFulfill = resp.removeItems.every(item => {
        const name  = capitalize(item.name || '');
        const found = State.inventory.find(i => i.name === name);
        return found && (found.amount || 1) >= (item.amount || 1);
      });
      if (!canFulfill) {
        Ui.addInstant('[ SYSTEM: TRADE BLOCKED — you do not have the required items ]', 'system');
        resp.addItems    = [];
        resp.creditsDelta = (typeof resp.creditsDelta === 'number' && resp.creditsDelta > 0) ? 0 : resp.creditsDelta;
      }
    }
    
    // equipped gate: if this looks like an equipped version, delete the equipped version
    if (Array.isArray(resp.addItems)) {
      // Filter out any addItem that looks like an equipped version
      resp.addItems = resp.addItems.filter(item => {
        if (item.name && (item.name.includes('(equipped)') || item.name.includes('equipped'))) {
          console.warn(`Blocked adding equipped item: ${item.name}`);
          return false;
        }
        return true;
      });
    }

    if (Array.isArray(resp.removeItems)) {
      resp.removeItems = resp.removeItems.filter(item => {
        if (item.name && (item.name.includes('(equipped)') || item.name.includes('equipped'))) {
          console.warn(`Blocked removing equipped item: ${item.name}`);
          return false;
        }
        return true;
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

    if (Array.isArray(resp.npcs)) {
      // Filter out NPCs that don't meet quality standards
      const validNpcs = resp.npcs.filter(n => {
        // Must have a name
        if (!n.name || n.name.trim() === '') return false;
        
        // Must have a valid relationship
        const validRels = ['Friendly', 'Neutral', 'Hostile', 'Suspicious', 'Ally', 'Dead'];
        if (!validRels.includes(n.relationship)) {
          console.warn(`Rejected NPC "${n.name}" - invalid relationship: ${n.relationship}`);
          return false;
        }
        
        // Description can be short for now (at least 5 chars)
        if (!n.description || n.description.trim().length < 5) {
          // Add a default description if missing
          n.description = `A character you met in ${State.location}. ${n.relationship} towards you.`;
        }
        
        // Reject generic placeholder names (but allow V, Adam Smasher, etc.)
        const genericNames = ['Bar Patron', 'Customer', 'Stranger', 'Citizen', 'Guard', 'Civilian', 'Bystander'];
        if (genericNames.some(gn => n.name.toLowerCase() === gn.toLowerCase())) {
          console.warn(`Rejected NPC "${n.name}" - generic background character`);
          return false;
        }
        
        return true;
      });
      
      // Process each valid NPC
      validNpcs.forEach(n => {
        const ex = State.npcs.find(x => x.name.toLowerCase() === n.name.toLowerCase());
        if (ex) {
          // Replace relationship if different
          if (ex.relationship !== n.relationship) {
            ex.relationship = n.relationship;
            Ui.addInstant(`[ ${n.name} now views you as ${n.relationship.toLowerCase()} ]`, 'system');
          }
          // Update description if provided
          if (n.description && n.description.length > (ex.description?.length || 0)) {
            ex.description = n.description;
          }
        } else {
          State.npcs.push({ 
            name: n.name, 
            relationship: n.relationship,
            description: n.description || `Met in ${State.location}.`
          });
          Ui.addInstant(`[ MET: ${n.name} (${n.relationship}) ]`, 'system');
        }
      });
      
      // Remove any duplicate NPC entries
      State.npcs = State.npcs.filter((npc, index, self) => 
        index === self.findIndex(n => n.name.toLowerCase() === npc.name.toLowerCase())
      );

      resp.npcs.forEach(n => {
        const existing = State.npcs.find(x => x.name.toLowerCase() === n.name.toLowerCase());
        if (existing && existing.relationship !== n.relationship) {
          addKeyFact(`${n.name} is now ${n.relationship.toLowerCase()}`);
        } else if (!existing && !genericName(n.name)) {
          addKeyFact(`Met ${n.name} (${n.relationship.toLowerCase()})`);
        }
      });
    }

    if (Array.isArray(resp.quests)) {
      resp.quests.forEach(q => {
        const title = capitalize(q.title || '');
        const ex    = State.quests.find(x => x.title.toLowerCase() === title.toLowerCase());
        if (ex) {
          // If status changed to 'complete' and it wasn't already, add a key fact
          if (q.status && q.status === 'complete' && ex.status !== 'complete') {
            addKeyFact(`Completed quest: ${title}`);
          }
          if (q.status && q.status === 'failed' && ex.status !== 'failed') {
            addKeyFact(`Failed quest: ${title}`);
          }
          if (q.description) ex.description = q.description;
          if (q.status)      ex.status      = q.status;
          if (q.reward)      ex.reward      = q.reward;
        } else {
          State.quests.push({ 
            title, 
            description: q.description || '', 
            status: q.status || 'active',
            reward: q.reward || null
          });
          // Optionally add fact when a new quest is accepted? Uncomment if desired:
          // if (q.status === 'active') addKeyFact(`Accepted quest: ${title}`);
        }
      });
    }

    /*
    if (resp.initialStats && !State.skills.length) {
      const s = resp.initialStats;
      ['str','agi','int','cha','tec','end'].forEach(k => {
        if (typeof s[k] === 'number') State.stats[k] = Math.max(1, Math.min(20, s[k]));
      });
      State.maxHp     = StatSystem.calcMaxHp();
      State.hp        = State.maxHp;
      State.maxEnergy = StatSystem.calcMaxEnergy();
      State.energy    = State.maxEnergy;
    }
    */

    if (!State.skills.length && Object.values(State.stats).every(v => v === 4)) {
      const cl = State.playerClass.toLowerCase();
      State.stats = cl.includes('netrunner') || cl.includes('hacker') ? { str:4,  agi:8,  int:18, cha:6,  tec:12, end:8  }
                  : cl.includes('merc')      || cl.includes('street')  ? { str:18, agi:10, int:4,  cha:4,  tec:8,  end:12 }
                  : cl.includes('fixer')     || cl.includes('social')  ? { str:6,  agi:8,  int:8,  cha:18, tec:8,  end:8  }
                  : { str:12, agi:10, int:10, cha:8, tec:8, end:8 };
      State.maxHp     = StatSystem.calcMaxHp();
      State.hp        = State.maxHp;
      State.maxEnergy = StatSystem.calcMaxEnergy();
      State.energy    = State.maxEnergy;
      if (!State.skills.length) State.skills = generateDefaultSkills();
      Ui.addInstant('[SYSTEM: STATS INITIALIZED FROM CLASS ARCHETYPE]', 'system');
    }

    if (Array.isArray(resp.initialSkills) && !State.skills.length) {
      const valid = resp.initialSkills.filter(isValidSkill);
      if (valid.length) {
        State.skills = valid.map(sk => ({ ...sk, currentCooldown:0 }));
      }
      if (State.skills.length === 0) {
        console.warn('All initialSkills rejected, falling back to defaults.');
        State.skills = generateDefaultSkills();
      }
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
      if (!exists) {
        if (isValidSkill(resp.newSkill)) {
          State.skills.push({ ...resp.newSkill, currentCooldown:0 });
          // Add key fact for learning a new skill
          addKeyFact(`Learned new skill: ${resp.newSkill.name}`);
        } else {
          console.warn('Rejected invalid skill:', resp.newSkill.name);
          Ui.addInstant(`[ SYSTEM: skill "${resp.newSkill.name}" rejected — no combat value ]`, 'system');
        }
      }
    }
  },

  pendingCombat: null,
  pendingGui: null,
};

const StatSystem = {
  getEquipBonus(stat) {
    let total = 0;
    Object.values(State.equipped).forEach(item => {
      if (item && item.statBonus && item.statBonus[stat]) {
        total += item.statBonus[stat];
      }
    });
    return total;
  },
  
  calcMaxHp() {
    const baseHp = State.classBaseHp || 80;
    const endBonus = (State.stats.end - 10) * 2;
    const total = Math.max(10, baseHp + endBonus) + this.getEquipBonus('hp');
    return Math.floor(total);
  },

  calcMaxEnergy() {
    const baseEnergy = State.classBaseEnergy || 70;
    const intBonus = (State.stats.int - 10) * 1.5;
    const total = Math.max(10, baseEnergy + intBonus) + this.getEquipBonus('energy') + this.getEquipBonus('en');
    return Math.floor(total);
  },

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
