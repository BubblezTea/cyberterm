let activeCombat = null;

const CombatEngine = {
  _narrationBusy: false,

  async narrateAction(promptText, context) {
    if (!COMBAT_NARRATION_ENABLED) return promptText;
    if (this._narrationBusy)       return promptText;

    this._narrationBusy = true;
    try {
      const fullPrompt = `You are the narrator of a gritty cyberpunk RPG. A combat event just happened:
${promptText}

Current situation:
- Player HP: ${State.hp}/${State.maxHp}
- Enemy: ${activeCombat.enemy.name} HP: ${activeCombat.enemy.hp}/${activeCombat.enemy.maxHp}
- Round: ${activeCombat.round}

Write ONE sentence of immersive, suspenseful narration. Use vivid, gritty cyberpunk language. No game mechanics or numbers. Respond with: {"narration":"your sentence here"}.`;

      const resp = await Llm.send(fullPrompt, context || 'combat_narration');
      return resp.narration || promptText;
    } catch(e) {
      console.warn('AI narration failed:', e);
      return promptText;
    } finally {
      this._narrationBusy = false;
    }
  },

  start(combatData) {
    const enemy = combatData.enemy;
    activeCombat = {
      enemy: {
        name:          enemy.name,
        level:         enemy.level || 1,
        hp:            enemy.hp,
        maxHp:         enemy.hp,
        description:   enemy.description || '',
        skills:        (enemy.skills || []).map(s => ({ ...s, currentCooldown:0 })),
        statusEffects: [],
      },
      playerStatusEffects: [],
      round:    1,
      cooldowns:{},
      locked:   false,
    };

    State.energy = Math.min(State.energy + 20, State.maxEnergy);
    document.getElementById('combatLog').innerHTML = '';
    this.clog(`⚔ Combat begins: ${enemy.name} (LV${enemy.level||1})`, 'cl-system');
    this.refresh();
    document.getElementById('combatOverlay').classList.add('open');
    Ui.setInputLocked(true);
  },

  clog(text, cls = 'cl-system') {
    const log = document.getElementById('combatLog');
    const el  = document.createElement('div');
    el.className  = 'cl-entry ' + cls;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = 999999;
  },

  refresh() {
    if (!activeCombat) return;
    const c = activeCombat;
    document.getElementById('ceEnemyName').textContent  = c.enemy.name.toUpperCase();
    document.getElementById('ceEnemyLevel').textContent = `LVL ${c.enemy.level}`;
    document.getElementById('ceEnemyDesc').textContent  = c.enemy.description;
    document.getElementById('ceHpText').textContent     = `${Math.max(0,c.enemy.hp)}/${c.enemy.maxHp}`;
    document.getElementById('ceHpFill').style.width     = `${Math.max(0, c.enemy.hp/c.enemy.maxHp*100)}%`;
    document.getElementById('ceRound').textContent      = c.round;
    this.renderStatuses('ceStatuses', c.enemy.statusEffects);
    this.renderStatuses('cpStatuses', c.playerStatusEffects);
    document.getElementById('cpHpFill').style.width  = `${State.hp/State.maxHp*100}%`;
    document.getElementById('cpHpText').textContent  = `${State.hp}/${State.maxHp}`;
    document.getElementById('cpEnFill').style.width  = `${State.energy/State.maxEnergy*100}%`;
    document.getElementById('cpEnText').textContent  = `${State.energy}/${State.maxEnergy}`;
    Ui.updateHeader();
    this.buildSkillGrid();
  },

  renderStatuses(elId, statuses) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = statuses.map(sf => {
      const cls = { dot:'sc-dot', skip:'sc-skip', expose:'sc-expose', buff_shield:'sc-buff', buff_hp:'sc-buff' }[sf.type] || 'sc-debuff';
      return `<span class="status-chip ${cls}">${sf.name} ${sf.duration}T</span>`;
    }).join('');
  },

  buildSkillGrid() {
    const grid   = document.getElementById('combatSkillGrid');
    const c      = activeCombat;
    const buttons = [];

    State.skills.forEach(sk => {
      const cd      = c.cooldowns[sk.name] || 0;
      const canUse  = cd === 0 && State.energy >= sk.energyCost && !c.locked;
      const stunned = c.playerStatusEffects.some(s => s.type === 'skip');
      const dmgStr  = sk.damage ? `${sk.damage[0]}-${sk.damage[1]}` : '—';
      buttons.push(`<button class="cb-skill-btn" data-skill="${sk.name}" ${(!canUse || stunned) ? 'disabled' : ''}>
        ${cd > 0 ? `<span class="csb-cd">${cd}T</span>` : ''}
        <span class="csb-name">${sk.name}</span>
        <span class="csb-meta">${sk.energyCost}en · ${dmgStr}dmg</span>
      </button>`);
    });

    const consumable = State.inventory.find(i =>
      /stim|heal|med|inject|boost|patch|syringe/i.test(i.name) && i.amount > 0
    );

    buttons.push(`<button class="cb-skill-btn csb-special" data-skill="__wait" ${c.locked ? 'disabled' : ''}>
      <span class="csb-name">WAIT</span>
      <span class="csb-meta">+25 energy</span>
    </button>`);

    buttons.push(`<button class="cb-skill-btn csb-special" data-skill="__item" ${(!consumable||c.locked) ? 'disabled' : ''}>
      <span class="csb-name">USE ITEM</span>
      <span class="csb-meta">${consumable ? consumable.name : 'none'}</span>
    </button>`);

    buttons.push(`<button class="cb-skill-btn csb-flee" data-skill="__flee" ${c.locked ? 'disabled' : ''}>
      <span class="csb-name">FLEE</span>
      <span class="csb-meta">AGI check</span>
    </button>`);

    grid.innerHTML = buttons.join('');
    grid.querySelectorAll('.cb-skill-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => this.playerAction(btn.dataset.skill));
    });
  },

  async playerAction(skillName) {
    if (!activeCombat || activeCombat.locked) return;
    activeCombat.locked = true;
    document.getElementById('ceTurnLabel').textContent = 'ENEMY TURN';
    document.getElementById('ceTurnLabel').style.color = '#ff6b7a';

    const c = activeCombat;

    const stunIdx = c.playerStatusEffects.findIndex(s => s.type === 'skip');
    if (stunIdx !== -1) {
      c.playerStatusEffects[stunIdx].duration--;
      if (c.playerStatusEffects[stunIdx].duration <= 0)
        c.playerStatusEffects.splice(stunIdx, 1);
      const n = await this.narrateAction('You are stunned and cannot act.', 'player_stunned');
      this.clog(n, 'cl-system');
      setTimeout(() => this.enemyTurn(), 600);
      return;
    }

    if (skillName === '__wait') {
      State.energy = Math.min(State.maxEnergy, State.energy + 25);
      this.clog(`You wait and recover energy. (EN: ${State.energy}/${State.maxEnergy})`, 'cl-player');
      setTimeout(() => this.enemyTurn(), 500);
      return;
    }

    if (skillName === '__flee') {
      const roll = Math.floor(Math.random() * 20) + 1;
      const thr  = 8 - Math.floor(State.stats.agi / 2);
      if (roll >= thr) {
        this.clog(`You slip away into the dark. (Roll: ${roll})`, 'cl-system');
        setTimeout(() => this.endCombat('flee'), 800);
      } else {
        this.clog(`You fail to escape! (Roll: ${roll} — needed ${thr}+)`, 'cl-miss');
        setTimeout(() => this.enemyTurn(), 600);
      }
      return;
    }

    if (skillName === '__item') {
      const consumable = State.inventory.find(i =>
        /stim|heal|med|inject|boost|patch|syringe/i.test(i.name) && i.amount > 0
      );
      if (consumable) {
        const healAmt = 20 + State.stats.tec * 2;
        State.hp = Math.min(State.maxHp, State.hp + healAmt);
        if (window.Sound) Sound.itemUse();
        consumable.amount--;
        if (consumable.amount <= 0) State.inventory.splice(State.inventory.indexOf(consumable), 1);
        this.clog(`You use ${consumable.name}: +${healAmt} HP`, 'cl-player');
        setTimeout(() => this.enemyTurn(), 500);
      }
      return;
    }

    const skill = State.skills.find(s => s.name === skillName);
    if (!skill) { activeCombat.locked = false; return; }
    if (State.energy < skill.energyCost) { activeCombat.locked = false; return; }

    State.energy -= skill.energyCost;
    c.cooldowns[skill.name] = skill.cooldown || 0;

    let dmg    = 0;
    let logCls = 'cl-player';
    let logMsg = '';
    let isCrit = false;

    if (skill.damage) {
      const base       = skill.damage[0] + Math.floor(Math.random() * (skill.damage[1] - skill.damage[0] + 1));
      const statMod    = skill.statScaling ? Math.floor(State.stats[skill.statScaling] * 0.4) : 0;
      const critChance = State.stats.agi * 1.5;
      isCrit           = Math.random() * 100 < critChance;
      const exposeMulti= c.enemy.statusEffects.find(s => s.type === 'expose') ? 1.5 : 1;
      dmg = Math.max(1, Math.floor((base + statMod) * (isCrit ? 1.5 : 1) * exposeMulti));

      if (isCrit) logCls = 'cl-crit';
      logMsg = `▶ ${skill.name}: ${dmg} damage${isCrit ? ' [CRIT!]' : ''}${exposeMulti > 1 ? ' [EXPOSED]' : ''}`;
      c.enemy.hp -= dmg;
    } else {
      logMsg = `▶ ${skill.name} activated`;
    }

    if (skill.statusEffect) {
      let roll   = Math.floor(Math.random() * 20) + 1;
      let target = 10;
      if (skill.statScaling) target += Math.floor(State.stats[skill.statScaling] * 0.5);
      else                   target += Math.floor(State.stats.cha * 0.5);

      if (roll >= target) {
        const existing = c.enemy.statusEffects.find(s => s.name === skill.statusEffect.name);
        if (existing) existing.duration = skill.statusEffect.duration;
        else          c.enemy.statusEffects.push({ ...skill.statusEffect });
        logMsg += ` [${skill.statusEffect.name} applied! (roll: ${roll} vs ${target})]`;
      } else {
        logMsg += ` [${skill.statusEffect.name} resisted! (roll: ${roll} vs ${target})]`;
      }
    }

    if (dmg > 0) { if (window.Sound) Sound.combatHit(true); }
    else if (skill.damage) { if (window.Sound) Sound.combatMiss(); }

    let narText = `${skill.name} dealing ${dmg} damage${isCrit ? ' with a critical hit!' : ''}`;
    if (skill.statusEffect) {
      const applied = c.enemy.statusEffects.some(s => s.name === skill.statusEffect.name);
      narText += applied ? ` and applying ${skill.statusEffect.name}.` : ` but the enemy resists the ${skill.statusEffect.name}.`;
    }
    const aiNar = await this.narrateAction(narText, `player_action: ${skill.name}`);
    this.clog(aiNar, logCls);

    if (c.enemy.hp <= 0) {
      setTimeout(() => this.endCombat('win'), 600);
      return;
    }
    setTimeout(() => this.enemyTurn(), 700);
  },

  async enemyTurn() {
    if (!activeCombat) return;
    const c = activeCombat;

    const enemyStun = c.enemy.statusEffects.find(s => s.type === 'skip');
    if (enemyStun) {
      const n = await this.narrateAction(`${c.enemy.name} is stunned and cannot act.`, 'enemy_stunned');
      this.clog(n, 'cl-status');
    } else {
      const available = c.enemy.skills.filter(s => (s.currentCooldown || 0) === 0);
      const eSkill = available.length ? available[Math.floor(Math.random() * available.length)] : null;

      if (eSkill) {
        const slowDebuff = c.playerStatusEffects.find(s => s.type === 'debuff_agi');
        const effectiveAgi = State.stats.agi - (slowDebuff ? slowDebuff.value : 0);
        const dodged = Math.random() * 100 < Math.max(0, effectiveAgi * 3);

        if (dodged) {
          const n = await this.narrateAction(`${c.enemy.name} tries to attack but you dodge!`, 'enemy_miss');
          this.clog(n, 'cl-miss');
        } else {
          const eDmg = (eSkill.damage?.[0] || 5) + Math.floor(Math.random() * ((eSkill.damage?.[1] || 12) - (eSkill.damage?.[0] || 5) + 1));
          const shieldSf = c.playerStatusEffects.find(s => s.type === 'buff_shield');
          let finalDmg = eDmg;
          if (shieldSf) {
            const absorbed = Math.min(shieldSf.value, eDmg);
            finalDmg -= absorbed;
            shieldSf.value -= absorbed;
            if (shieldSf.value <= 0) c.playerStatusEffects.splice(c.playerStatusEffects.indexOf(shieldSf), 1);
          }
          finalDmg = Math.max(0, finalDmg);
          State.hp = Math.max(0, State.hp - finalDmg);

          // Play hit sound only if damage was actually taken
          if (!dodged && finalDmg > 0) {
            if (window.Sound) Sound.combatHit(false);
          }

          // If player dies, trigger death screen and end combat
          if (State.hp <= 0) {
            const reason = `You were slain by ${c.enemy.name} in round ${c.round}.`;
            checkDeath(reason);                 // defined in main.js
            this.endCombat('death');
            return;
          }

          const n = await this.narrateAction(`${c.enemy.name} uses ${eSkill.name} dealing ${finalDmg} damage.`, `enemy_action: ${eSkill.name}`);
          this.clog(n, 'cl-enemy');

          if (eSkill.statusEffect) {
            const ex = c.playerStatusEffects.find(s => s.name === eSkill.statusEffect.name);
            if (ex) ex.duration = eSkill.statusEffect.duration;
            else c.playerStatusEffects.push({ ...eSkill.statusEffect });
            const sn = await this.narrateAction(`${c.enemy.name} applies ${eSkill.statusEffect.name} to you!`, 'enemy_status');
            this.clog(sn, 'cl-status');
          }
        }
        if (eSkill.cooldown) eSkill.currentCooldown = eSkill.cooldown;
      } else {
        const n = await this.narrateAction(`${c.enemy.name} hesitates, looking for an opening.`, 'enemy_regroup');
        this.clog(n, 'cl-system');
      }
    }

    this.tickStatuses();

    State.skills.forEach(sk => { if (c.cooldowns[sk.name] > 0) c.cooldowns[sk.name]--; });
    c.enemy.skills.forEach(sk => { if (sk.currentCooldown > 0) sk.currentCooldown--; });

    State.energy = Math.min(State.maxEnergy, State.energy + 5 + Math.floor(State.stats.int / 2));
    c.round++;

    if (State.hp <= 0) {
      // In case death wasn't caught earlier (e.g., from status effects), handle it now
      const reason = `You succumbed to your wounds in round ${c.round}.`;
      checkDeath(reason);
      this.endCombat('death');
      return;
    }

    this.refresh();
    document.getElementById('ceTurnLabel').textContent = 'YOUR TURN';
    document.getElementById('ceTurnLabel').style.color = 'var(--green)';
    activeCombat.locked = false;
    this.refresh();
  },

  tickStatuses() {
    const c    = activeCombat;
    const tick = (effects, isPlayer) => {
      for (let i = effects.length-1; i >= 0; i--) {
        const sf = effects[i];
        if (sf.type === 'dot') {
          const dmg = sf.value || 5;
          if (isPlayer) { State.hp = Math.max(0, State.hp - dmg); this.clog(`  ${sf.name}: -${dmg} HP`, 'cl-status'); }
          else          { c.enemy.hp = Math.max(0, c.enemy.hp - dmg); this.clog(`  ${sf.name}: ${c.enemy.name} -${dmg} HP`, 'cl-status'); }
        }
        if (sf.type === 'buff_hp' && isPlayer) {
          State.hp = Math.min(State.maxHp, State.hp + sf.value);
          this.clog(`  ${sf.name}: +${sf.value} HP`, 'cl-status');
        }
        sf.duration--;
        if (sf.duration <= 0) {
          this.clog(`  ${sf.name} fades.`, 'cl-system');
          effects.splice(i, 1);
        }
      }
    };
    tick(c.playerStatusEffects, true);
    tick(c.enemy.statusEffects,  false);
  },

  endCombat(outcome) {
    const c = activeCombat;
    if (!c) return;
    document.getElementById('combatOverlay').classList.remove('open');
    activeCombat = null;

    const enemyName = c.enemy.name;
    const rounds    = c.round - 1;

    if (outcome === 'win') {
      const baseXp = c.enemy.level * 25 + Math.floor(Math.random() * 20);
      Ui.addInstant(`[ COMBAT VICTORY: ${enemyName} defeated in ${rounds} rounds ]`, 'system');
      Llm.send(`[COMBAT WON] Defeated ${enemyName} (LV${c.enemy.level}) in ${rounds} rounds. Player HP: ${State.hp}/${State.maxHp}. Narrate aftermath and grant ${baseXp} XP.`)
        .then(resp => {
          Engine.applyResponse(resp);
          if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
          StatSystem.gainXp(baseXp);
          const wq = () => { if (Ui.isTyping||Ui.typeQueue.length) setTimeout(wq,200); else { Ui.setInputLocked(false); Ui.updateHeader(); Ui.renderSidebar(); } };
          wq();
        });

    } else if (outcome === 'lose') {
      State.hp = 0;
      const deathReason = `You were defeated by ${enemyName} and succumbed to your wounds.`;
      // Let the AI narrate the final moments
      Llm.send(`[COMBAT LOST] The player was killed by ${enemyName}. Describe their final moments in a grim, poetic way.`).then(resp => {
        if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
        // Wait for narration to finish, then trigger death screen
        const waitDeath = () => {
          if (Ui.isTyping || Ui.typeQueue.length) setTimeout(waitDeath, 200);
          else checkDeath(deathReason);
        };
        waitDeath();
      });
      return;
    } else if (outcome === 'death') {
      document.getElementById('combatOverlay').classList.remove('open');
      activeCombat = null;
      // Death screen already shown, do nothing else
      return;
    } else {
      Ui.addInstant(`[ You fled from ${enemyName} ]`, 'system');
      Llm.send(`[COMBAT FLED] Player fled from ${enemyName}. Narrate the brief escape. Minor consequence.`)
        .then(resp => {
          Engine.applyResponse(resp);
          if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
          const wq = () => { if (Ui.isTyping||Ui.typeQueue.length) setTimeout(wq,200); else { Ui.setInputLocked(false); Ui.updateHeader(); Ui.renderSidebar(); } };
          wq();
        });
    }
  },
};

const Qte = {
  active:  false,
  timer:   null,
  resolve: null,

  trigger(qteData) {
    return new Promise(resolve => {
      this.active  = true;
      this.resolve = resolve;

      const overlay   = document.getElementById('qteOverlay');
      const promptEl  = document.getElementById('qtePrompt');
      const btn       = document.getElementById('qteBtn');
      const timerFill = document.getElementById('qteTimerFill');

      promptEl.textContent = qteData.prompt || 'React now!';
      btn.textContent      = qteData.action || 'ACT';

      const ms = (qteData.timeLimit || 4) * 1000;
      timerFill.style.transition = 'none';
      timerFill.style.width      = '100%';
      overlay.classList.add('open');
      Ui.setInputLocked(true);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        timerFill.style.transition = `width ${ms}ms linear`;
        timerFill.style.width      = '0%';
      }));

      this.timer  = setTimeout(() => this.finish(false), ms);
      btn.onclick = () => this.finish(true);
    });
  },

  finish(success) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    document.getElementById('qteOverlay').classList.remove('open');
    document.getElementById('qteBtn').onclick = null;
    this.resolve?.(success);
    this.resolve = null;
  },
};

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && Qte.active) {
    e.preventDefault();
    Qte.finish(true);
  }
});
