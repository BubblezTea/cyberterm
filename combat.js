// combat.js - CyberTerm Combat Engine with full creative effect system

let activeCombat = null;

// ------------------------------------------------------------
//  Effect Execution Engine
// ------------------------------------------------------------
const EffectEngine = {
  execute(combatant, action, sourceName) {
    const target = this._resolveTarget(combatant, action.target);
    if (!target) return false;

    switch (action.type) {
      case 'damage':
        return this._applyDamage(target, action.value, sourceName);
      case 'heal':
        return this._applyHeal(target, action.value, sourceName);
      case 'skip_turn':
        return this._applySkipTurn(target, action.duration || 1, sourceName);
      case 'change_team':
        return this._applyChangeTeam(target, action.newTeam, sourceName);
      case 'stat_mod':
        return this._applyStatMod(target, action.stat, action.delta, action.duration || 1, sourceName);
      case 'extra_turn':
        return this._applyExtraTurn(target, sourceName);
      case 'reflect_damage':
        return this._applyReflect(target, action.percent, action.duration || 1, sourceName);
      case 'spread':
        return this._applySpread(combatant, action.effectName, action.radius || 1, sourceName);
      case 'immune':
        return this._applyImmune(target, action.damageType, action.duration || 1, sourceName);
      case 'transform_skill':
        return this._applyTransformSkill(target, action.oldSkillName, action.newSkillName, sourceName);
      case 'wait':
        return true;
      default:
        console.warn('Unknown action type:', action.type);
        return false;
    }
  },

  _resolveTarget(combatant, targetId) {
    if (!targetId || targetId === 'self') return combatant;
    if (targetId === 'player') return activeCombat?.playerObj;
    return activeCombat?.combatants.find(c => c.id === targetId || c.name === targetId);
  },

  _applyDamage(target, value, sourceName) {
    const actualDmg = Math.max(1, Math.floor(value));
    target.hp = Math.max(0, target.hp - actualDmg);
    if (target.id === 'player') State.hp = target.hp;
    CombatEngine.clog(`${sourceName || 'Effect'} deals ${actualDmg} damage to ${target.name}.`, 'cl-effect');
    return true;
  },

  _applyHeal(target, value, sourceName) {
    const actualHeal = Math.max(1, Math.floor(value));
    target.hp = Math.min(target.maxHp, target.hp + actualHeal);
    if (target.id === 'player') State.hp = target.hp;
    CombatEngine.clog(`${sourceName || 'Effect'} heals ${target.name} for ${actualHeal} HP.`, 'cl-effect');
    return true;
  },

  _applySkipTurn(target, duration, sourceName) {
    const skipEffect = target.statusEffects.find(e => e.name === 'Stunned' && e.type === 'skip');
    if (skipEffect) {
      skipEffect.duration = Math.max(skipEffect.duration, duration);
    } else {
      target.statusEffects.push({
        name: 'Stunned',
        type: 'skip',
        duration: duration,
        description: 'Cannot act for the duration.'
      });
    }
    CombatEngine.clog(`${target.name} is stunned for ${duration} turn(s).`, 'cl-effect');
    return true;
  },

  _applyChangeTeam(target, newTeam, sourceName) {
    const oldTeam = target.team;
    target.team = newTeam;
    CombatEngine.clog(`${target.name} switches sides! Now fighting for ${newTeam}.`, 'cl-effect');
    CombatEngine._calculateTurnOrder();
    return true;
  },

  _applyStatMod(target, stat, delta, duration, sourceName) {
    if (!target.tempMods) target.tempMods = {};
    target.tempMods[stat] = (target.tempMods[stat] || 0) + delta;
    target.statModDurations = target.statModDurations || {};
    target.statModDurations[stat] = Math.max(target.statModDurations[stat] || 0, duration);
    const sign = delta >= 0 ? '+' : '';
    CombatEngine.clog(`${target.name}: ${stat.toUpperCase()} ${sign}${delta} for ${duration} turn(s).`, 'cl-effect');
    return true;
  },

  _applyExtraTurn(target, sourceName) {
    const currentIdx = activeCombat.turnOrder.findIndex(c => c.id === activeCombat.currentCombatant?.id);
    if (currentIdx !== -1) {
      activeCombat.turnOrder.splice(currentIdx + 1, 0, target);
      CombatEngine.clog(`${target.name} gains an extra turn!`, 'cl-effect');
    }
    return true;
  },

  _applyReflect(target, percent, duration, sourceName) {
    target.reflectPercent = (target.reflectPercent || 0) + percent;
    target.reflectDuration = Math.max(target.reflectDuration || 0, duration);
    CombatEngine.clog(`${target.name} reflects ${percent}% damage for ${duration} turn(s).`, 'cl-effect');
    return true;
  },

  _applySpread(source, effectName, radius, sourceName) {
    const targets = activeCombat.combatants.filter(c => c.team !== source.team && c.id !== source.id);
    targets.forEach(target => {
      const sourceEffect = source.statusEffects.find(e => e.name === effectName);
      if (sourceEffect) {
        const newEffect = JSON.parse(JSON.stringify(sourceEffect));
        newEffect.duration = Math.max(1, sourceEffect.duration - 1);
        target.statusEffects.push(newEffect);
        CombatEngine.clog(`${effectName} spreads from ${source.name} to ${target.name}!`, 'cl-effect');
      }
    });
    return true;
  },

  _applyImmune(target, damageType, duration, sourceName) {
    if (!target.immunities) target.immunities = [];
    target.immunities.push({ type: damageType, remaining: duration });
    CombatEngine.clog(`${target.name} is immune to ${damageType} for ${duration} turn(s).`, 'cl-effect');
    return true;
  },

  _applyTransformSkill(target, oldSkillName, newSkillName, sourceName) {
    const skillIdx = target.skills.findIndex(s => s.name === oldSkillName);
    if (skillIdx !== -1) {
      const newSkill = {
        name: newSkillName,
        description: `Transformed from ${oldSkillName}`,
        damage: [5, 12],
        energyCost: 5,
        cooldown: 0,
        currentCooldown: 0,
        statScaling: null,
        statusEffect: null
      };
      target.skills[skillIdx] = newSkill;
      CombatEngine.clog(`${target.name}'s ${oldSkillName} becomes ${newSkillName}!`, 'cl-effect');
    }
    return true;
  }
};

// ------------------------------------------------------------
//  Combat Engine Main
// ------------------------------------------------------------
const CombatEngine = {
  _narrationBusy: false,

  async _narrate(mechMsg, aiCtx, cls) {
    if (!COMBAT_NARRATION_ENABLED || this._narrationBusy) {
      this.clog(mechMsg, cls);
      return;
    }
    this._narrationBusy = true;
    try {
      const c = activeCombat;
      const prompt = `Cyberpunk RPG combat narrator. Event: ${aiCtx}
Current combatants:
- Player: ${State.hp}/${State.maxHp} HP
- ${c.combatants.map(cb => `${cb.name}: ${Math.max(0,cb.hp)}/${cb.maxHp} HP (${cb.team})`).join(', ')}
Round ${c.round}.
One terse, visceral sentence. No numbers, no mechanics. Reply only: {"narration":"..."}`;
      const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 100));
      const hit = raw.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      this.clog(hit ? hit[1] : mechMsg, cls);
    } catch(e) {
      this.clog(mechMsg, cls);
    } finally {
      this._narrationBusy = false;
    }
  },

  clog(text, cls = 'cl-system') {
    const log = document.getElementById('combatLog');
    if (!log) return;
    const el = document.createElement('div');
    el.className = 'cl-entry ' + cls;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = 999999;
    if (activeCombat) activeCombat.combatLog.push({ text, cls, timestamp: Date.now() });
  },

  // ------------------------------------------------------------
  //  Combat Initialization
  // ------------------------------------------------------------
  start(combatData) {
    const combatants = [];
    const playerCombatant = {
      id: 'player',
      name: State.playerName || 'You',
      team: 'player',
      hp: State.hp,
      maxHp: State.maxHp,
      agi: State.stats.agi,
      statusEffects: [],
      pendingActions: [],
      tempMods: {},
      statModDurations: {},
      reflectPercent: 0,
      reflectDuration: 0,
      immunities: [],
      skills: [],
      isPlayer: true
    };
    combatants.push(playerCombatant);

    const enemies = Array.isArray(combatData.enemies) ? combatData.enemies : [combatData.enemy];
    enemies.forEach((enemy, idx) => {
      let enemySkills = enemy.skills || [];
      if (enemySkills.length === 0) {
        enemySkills = [{
          name: 'Punch',
          damage: [5, 12],
          energyCost: 5,
          cooldown: 0,
          currentCooldown: 0,
          statusEffect: null
        }];
      }
      combatants.push({
        id: `enemy_${idx}`,
        name: enemy.name,
        team: 'enemy',
        hp: enemy.hp,
        maxHp: enemy.hp,
        level: enemy.level || 1,
        description: enemy.description || '',
        skills: enemySkills.map(s => ({ ...s, currentCooldown: 0 })),
        statusEffects: [],
        pendingActions: [],
        tempMods: {},
        statModDurations: {},
        reflectPercent: 0,
        reflectDuration: 0,
        immunities: [],
        agi: enemy.agi || 5,
        isPlayer: false
      });
    });

    if (combatData.allies && Array.isArray(combatData.allies)) {
      combatData.allies.forEach((ally, idx) => {
        combatants.push({
          id: `ally_${idx}`,
          name: ally.name,
          team: 'ally',
          hp: ally.hp,
          maxHp: ally.hp,
          level: ally.level || 1,
          description: ally.description || '',
          skills: (ally.skills || []).map(s => ({ ...s, currentCooldown: 0 })),
          statusEffects: [],
          pendingActions: [],
          tempMods: {},
          statModDurations: {},
          reflectPercent: 0,
          reflectDuration: 0,
          immunities: [],
          agi: ally.agi || 5,
          isPlayer: false
        });
      });
    }

    activeCombat = {
      combatants: combatants,
      playerObj: playerCombatant,
      round: 1,
      cooldowns: {},
      locked: false,
      turnOrder: [],
      currentTurnIndex: 0,
      currentCombatant: null,
      combatLog: [],
      dialogueEnabled: true,
      defeatedEnemies: []
    };

    this._calculateTurnOrder();
    State.energy = Math.min(State.maxEnergy, State.energy + 20);
    document.getElementById('combatLog').innerHTML = '';
    this.clog(`⚔ Combat begins!`, 'cl-system');
    this.refresh();
    document.getElementById('combatOverlay').classList.add('open');
    document.getElementById('combatChatInput').focus();
    Ui.setInputLocked(true);
    this._nextTurn();
  },

  _calculateTurnOrder() {
    const c = activeCombat;
    const alive = c.combatants.filter(cb => cb.hp > 0);
    c.turnOrder = alive.sort((a, b) => {
      const aAgi = (a.isPlayer ? State.stats.agi : a.agi) + (a.tempMods?.agi || 0);
      const bAgi = (b.isPlayer ? State.stats.agi : b.agi) + (b.tempMods?.agi || 0);
      return bAgi - aAgi;
    });
    c.currentTurnIndex = 0;
    c.currentCombatant = c.turnOrder[0];
  },

  refresh() {
    if (!activeCombat) return;
    const c = activeCombat;
    const enemyContainer = document.getElementById('ceEnemyContainer');
    if (enemyContainer) {
      const enemies = c.combatants.filter(cb => cb.team === 'enemy' && cb.hp > 0);
      if (enemies.length) {
        enemyContainer.innerHTML = enemies.map(enemy => `
          <div class="ce-enemy-card" data-id="${enemy.id}">
            <div class="ce-header">
              <span class="ce-name">${enemy.name}</span>
              <span class="ce-level">LVL ${enemy.level || 1}</span>
            </div>
            <div class="ce-desc">${enemy.description || ''}</div>
            <div class="ce-hp-row">
              <div class="ce-hp-bar"><div class="ce-hp-fill" style="width:${Math.max(0, enemy.hp/enemy.maxHp*100)}%"></div></div>
              <span class="ce-hp-text">${Math.max(0, enemy.hp)}/${enemy.maxHp}</span>
            </div>
            <div class="ce-statuses" id="ceStatuses_${enemy.id}"></div>
          </div>`).join('');
        enemies.forEach(enemy => {
          const statusEl = document.getElementById(`ceStatuses_${enemy.id}`);
          if (statusEl) statusEl.innerHTML = this._renderStatuses(enemy.statusEffects);
        });
      } else {
        enemyContainer.innerHTML = '<div class="panel-empty">All enemies defeated!</div>';
      }
    }

    const allyContainer = document.getElementById('ceAllyContainer');
    if (allyContainer) {
      const allies = c.combatants.filter(cb => cb.team === 'ally' && cb.hp > 0);
      const allyLabel = document.getElementById('ceAllyLabel');
      if (allyLabel) allyLabel.style.display = allies.length ? 'block' : 'none';
      if (allies.length) {
        allyContainer.innerHTML = allies.map(ally => `
          <div class="ce-ally-card" data-id="${ally.id}">
            <div class="ce-header"><span class="ce-name">${ally.name}</span></div>
            <div class="ce-hp-row">
              <div class="ce-hp-bar"><div class="ce-hp-fill ally-fill" style="width:${Math.max(0, ally.hp/ally.maxHp*100)}%"></div></div>
              <span class="ce-hp-text">${Math.max(0, ally.hp)}/${ally.maxHp}</span>
            </div>
            <div class="ce-statuses" id="ceStatuses_${ally.id}"></div>
          </div>`).join('');
        allies.forEach(ally => {
          const statusEl = document.getElementById(`ceStatuses_${ally.id}`);
          if (statusEl) statusEl.innerHTML = this._renderStatuses(ally.statusEffects);
        });
      }
    }

    const turnLabel = document.getElementById('ceTurnLabel');
    if (turnLabel && c.currentCombatant) {
      if (c.currentCombatant.isPlayer) {
        turnLabel.textContent = 'YOUR TURN';
        turnLabel.style.color = 'var(--green)';
      } else {
        turnLabel.textContent = `${c.currentCombatant.name.toUpperCase()}'S TURN`;
        turnLabel.style.color = '#ff6b7a';
      }
    }
    document.getElementById('ceRound').textContent = c.round;
    this._renderPlayerStatuses();
    this.buildSkillGrid();

    document.getElementById('cpHpFill').style.width = `${State.hp/State.maxHp*100}%`;
    document.getElementById('cpHpText').textContent = `${State.hp}/${State.maxHp}`;
    document.getElementById('cpEnFill').style.width = `${State.energy/State.maxEnergy*100}%`;
    document.getElementById('cpEnText').textContent = `${State.energy}/${State.maxEnergy}`;
    Ui.updateHeader();
  },

  _renderStatuses(statuses) {
    if (!statuses || !statuses.length) return '';
    return statuses.map(sf => {
      let cls = 'sc-debuff';
      if (sf.type === 'dot') cls = 'sc-dot';
      else if (sf.type === 'skip') cls = 'sc-skip';
      else if (sf.type === 'expose') cls = 'sc-expose';
      else if (sf.type === 'buff_shield') cls = 'sc-buff';
      const desc = sf.description || `${sf.name} (${sf.duration}T)`;
      return `<span class="status-chip ${cls}" title="${desc}">${sf.name} ${sf.duration}T</span>`;
    }).join('');
  },

  _renderPlayerStatuses() {
    const container = document.getElementById('cpStatuses');
    if (!container) return;
    const player = activeCombat.combatants.find(c => c.id === 'player');
    container.innerHTML = player ? this._renderStatuses(player.statusEffects) : '';
  },

  buildSkillGrid() {
    const grid = document.getElementById('combatSkillGrid');
    if (!grid) return;
    const c = activeCombat;
    const isPlayerTurn = c.currentCombatant?.isPlayer === true;
    const stunned = c.playerObj?.statusEffects?.some(s => s.type === 'skip');
    const canAct = isPlayerTurn && !c.locked && !stunned && State.hp > 0;

    const buttons = [];
    const validTargets = c.combatants.filter(cb => cb.team !== 'player' && cb.hp > 0);

    State.skills.forEach(sk => {
      const cd = c.cooldowns[sk.name] || 0;
      const canUse = cd === 0 && State.energy >= sk.energyCost && canAct;
      const dmgStr = sk.damage ? `${sk.damage[0]}-${sk.damage[1]}` : '—';
      buttons.push(`<button class="cb-skill-btn" data-skill="${sk.name}" ${!canUse ? 'disabled' : ''}>
        ${cd > 0 ? `<span class="csb-cd">${cd}T</span>` : ''}
        <span class="csb-name">${sk.name}</span>
        <span class="csb-meta">${sk.energyCost}en · ${dmgStr}dmg</span>
      </button>`);
    });

    if (validTargets.length > 1 && canAct) {
      const targetButtonsHtml = validTargets.map(t => `
        <button class="combat-target-btn" data-target-id="${t.id}">
          <span class="target-name">${t.name}</span>
          <span class="target-hp">${Math.max(0, t.hp)}/${t.maxHp} HP</span>
        </button>
      `).join('');
      buttons.push(`<div class="combat-targets-group">
        <div class="combat-targets-label">TARGET</div>
        <div class="combat-targets-buttons" id="combatTargetButtons">${targetButtonsHtml}</div>
      </div>`);
    }

    const consumable = State.inventory.find(i => /stim|heal|med|inject|boost|patch|syringe/i.test(i.name) && i.amount > 0);
    buttons.push(`<button class="cb-skill-btn csb-special" data-skill="__wait" ${!canAct ? 'disabled' : ''}>
      <span class="csb-name">WAIT</span><span class="csb-meta">+25 energy</span>
    </button>`);
    buttons.push(`<button class="cb-skill-btn csb-special" data-skill="__item" ${(!consumable || !canAct) ? 'disabled' : ''}>
      <span class="csb-name">USE ITEM</span><span class="csb-meta">${consumable ? consumable.name : 'none'}</span>
    </button>`);
    buttons.push(`<button class="cb-skill-btn csb-flee" data-skill="__flee" ${!canAct ? 'disabled' : ''}>
      <span class="csb-name">FLEE</span><span class="csb-meta">AGI check</span>
    </button>`);

    grid.innerHTML = buttons.join('');

    let currentSelectedTargetId = validTargets[0]?.id;
    const targetContainer = document.getElementById('combatTargetButtons');
    if (targetContainer) {
      targetContainer.querySelectorAll('.combat-target-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          targetContainer.querySelectorAll('.combat-target-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentSelectedTargetId = btn.dataset.targetId;
        });
        if (btn === targetContainer.querySelector('.combat-target-btn:first-child')) btn.classList.add('active');
      });
    }

    grid.querySelectorAll('.cb-skill-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = currentSelectedTargetId || validTargets[0]?.id;
        this.playerAction(btn.dataset.skill, targetId);
      });
    });
  },

  // ------------------------------------------------------------
  //  Player Action
  // ------------------------------------------------------------
  async playerAction(skillName, targetId) {
    if (!activeCombat || activeCombat.locked) return;
    const c = activeCombat;
    if (!c.currentCombatant?.isPlayer) {
      this.clog('Not your turn!', 'cl-system');
      return;
    }
    activeCombat.locked = true;

    const stunned = c.playerObj.statusEffects.find(s => s.type === 'skip');
    if (stunned) {
      stunned.duration--;
      if (stunned.duration <= 0) c.playerObj.statusEffects = c.playerObj.statusEffects.filter(s => s !== stunned);
      await this._narrate('▶ STUNNED — you cannot act', 'Player is stunned and loses turn.', 'cl-system');
      this._nextTurn();
      return;
    }

    if (skillName === '__wait') {
      State.energy = Math.min(State.maxEnergy, State.energy + 25);
      await this._narrate(`▶ WAIT — +25 EN (${State.energy}/${State.maxEnergy})`, 'Player waits and recovers energy.', 'cl-player');
      this._nextTurn();
      return;
    }

    if (skillName === '__flee') {
      const roll = Math.floor(Math.random() * 20) + 1;
      const thr = 8 - Math.floor(State.stats.agi / 2);
      const success = roll >= thr;
      if (success) {
        await this._narrate(`▶ FLEE — success (roll ${roll})`, 'Player flees successfully.', 'cl-system');
        this.endCombat('flee', { roll, threshold: thr, agi: State.stats.agi });
      } else {
        await this._narrate(`▶ FLEE — failed (roll ${roll}, needed ${thr}+)`, 'Player fails to flee.', 'cl-miss');
        this._nextTurn();
      }
      return;
    }

    if (skillName === '__item') {
      const consumable = State.inventory.find(i => /stim|heal|med|inject|boost|patch|syringe/i.test(i.name) && i.amount > 0);
      if (consumable) {
        const healAmt = 20 + State.stats.tec * 2;
        State.hp = Math.min(State.maxHp, State.hp + healAmt);
        c.playerObj.hp = State.hp;
        if (window.Sound) Sound.itemUse();
        consumable.amount--;
        if (consumable.amount <= 0) State.inventory.splice(State.inventory.indexOf(consumable), 1);
        await this._narrate(`▶ ${consumable.name} — +${healAmt} HP (${State.hp}/${State.maxHp})`, `Player uses ${consumable.name} and heals.`, 'cl-player');
        this._nextTurn();
      }
      return;
    }

    const skill = State.skills.find(s => s.name === skillName);
    if (!skill) { activeCombat.locked = false; return; }
    if (State.energy < skill.energyCost) { activeCombat.locked = false; return; }

    State.energy -= skill.energyCost;
    c.cooldowns[skill.name] = skill.cooldown || 0;

    const target = c.combatants.find(cb => cb.id === targetId);
    if (!target || target.hp <= 0) { activeCombat.locked = false; return; }

    let dmg = 0;
    let isCrit = false;
    let exposeMultiplier = 1;
    
    // Check for expose effect on target
    const exposeEffect = target.statusEffects.find(s => s.type === 'expose');
    if (exposeEffect) exposeMultiplier = 1.5;
    
    if (skill.damage) {
      const base = skill.damage[0] + Math.floor(Math.random() * (skill.damage[1] - skill.damage[0] + 1));
      const statMod = skill.statScaling ? Math.floor(State.stats[skill.statScaling] * 0.4) : 0;
      isCrit = Math.random() * 100 < State.stats.agi * 1.5;
      dmg = Math.max(1, Math.floor((base + statMod) * (isCrit ? 1.5 : 1) * exposeMultiplier));
    }

    let finalDmg = dmg;
    let reflected = false;
    if (target.reflectPercent > 0 && dmg > 0) {
      const reflectDmg = Math.floor(dmg * target.reflectPercent / 100);
      if (reflectDmg > 0) {
        EffectEngine.execute(c.playerObj, { type: 'damage', value: reflectDmg, target: 'self' }, `${target.name}'s reflection`);
        reflected = true;
      }
    }

    if (finalDmg > 0) {
      target.hp = Math.max(0, target.hp - finalDmg);
      if (target.id === 'player') State.hp = target.hp;
    }

    // Build log message - handle skills with status effects but no damage
    let mechMsg = `▶ ${skill.name} on ${target.name}`;
    if (finalDmg > 0) {
      mechMsg += ` — ${finalDmg} dmg${isCrit ? ' [CRIT]' : ''}`;
    }
    if (reflected) {
      mechMsg += ` (reflected ${Math.floor(dmg * target.reflectPercent / 100)})`;
    }
    await this._narrate(mechMsg, `Player uses ${skill.name} on ${target.name}${finalDmg > 0 ? ` dealing ${finalDmg} damage` : ''}.`, isCrit ? 'cl-crit' : 'cl-player');

    const effectsToApply = skill.statusEffects || (skill.statusEffect ? [skill.statusEffect] : null);

    if (effectsToApply && effectsToApply.length) {
      for (const eff of effectsToApply) {
        // Check for advanced effect with effects array
        if (eff.effects && Array.isArray(eff.effects)) {
          for (const action of eff.effects) {
            const actionTarget = action.target === 'self' ? c.playerObj :
                                (action.target === 'ally' ? target : target);
            EffectEngine.execute(actionTarget, action, skill.name);
          }
          // Add the status effect to the target for duration tracking
          if (eff.duration > 0) {
            target.statusEffects.push({
              name: eff.name,
              description: eff.description || `${eff.name} effect.`,
              duration: eff.duration,
              effects: eff.effects,
              type: 'custom'
            });
          }
        } else {
          // Simple status effect (original system)
          if (eff.type === 'skip') {
            const skipEffect = target.statusEffects.find(e => e.name === 'Stunned' && e.type === 'skip');
            if (skipEffect) {
              skipEffect.duration = Math.max(skipEffect.duration, eff.duration);
            } else {
              target.statusEffects.push({
                name: 'Stunned',
                type: 'skip',
                duration: eff.duration,
                value: 0,
                description: `Stunned for ${eff.duration} turns.`
              });
            }
            this.clog(`${target.name} is stunned for ${eff.duration} turn(s)!`, 'cl-status');
          } 
          else if (eff.type === 'dot') {
            const dotEffect = target.statusEffects.find(e => e.type === 'dot');
            if (dotEffect) {
              dotEffect.duration = Math.max(dotEffect.duration, eff.duration);
              dotEffect.value = Math.max(dotEffect.value, eff.value);
            } else {
              target.statusEffects.push({
                name: eff.name,
                type: 'dot',
                duration: eff.duration,
                value: eff.value,
                icon: eff.icon,
                description: `${eff.value} damage per turn.`
              });
            }
            this.clog(`${target.name} is afflicted with ${eff.name} for ${eff.duration} turns!`, 'cl-status');
          }
          else if (eff.type === 'expose') {
            const exposeEffect = target.statusEffects.find(e => e.type === 'expose');
            if (exposeEffect) {
              exposeEffect.duration = Math.max(exposeEffect.duration, eff.duration);
              exposeEffect.value = Math.max(exposeEffect.value, eff.value);
            } else {
              target.statusEffects.push({
                name: eff.name,
                type: 'expose',
                duration: eff.duration,
                value: eff.value,
                description: `Takes ${eff.value}% extra damage.`
              });
            }
            this.clog(`${target.name} is exposed — taking +${eff.value}% damage!`, 'cl-status');
          }
          else if (eff.type === 'debuff') {
            const debuffEffect = target.statusEffects.find(e => e.type === 'debuff_agi');
            if (debuffEffect) {
              debuffEffect.duration = Math.max(debuffEffect.duration, eff.duration);
              debuffEffect.value = Math.max(debuffEffect.value, eff.value);
            } else {
              target.statusEffects.push({
                name: eff.name,
                type: 'debuff_agi',
                duration: eff.duration,
                value: eff.value,
                description: `AGI reduced by ${eff.value}.`
              });
            }
            this.clog(`${target.name}'s AGI is reduced by ${eff.value}!`, 'cl-status');
          }
          else if (eff.type === 'buff') {
            State.energy = Math.min(State.maxEnergy, State.energy + eff.value);
            this.clog(`+${eff.value} energy restored!`, 'cl-player');
          }
          else if (eff.type === 'buff_hp') {
            State.hp = Math.min(State.maxHp, State.hp + eff.value);
            c.playerObj.hp = State.hp;
            this.clog(`+${eff.value} HP restored!`, 'cl-player');
          }
        }
      }
    }

    this.refresh();
    if (target.hp <= 0) {
      this.clog(`${target.name} has been defeated!`, 'cl-system');
      activeCombat.defeatedEnemies.push({ name: target.name, id: target.id });
      const idx = c.combatants.findIndex(cb => cb.id === target.id);
      if (idx !== -1) c.combatants.splice(idx, 1);
    }

    const enemiesRemaining = c.combatants.filter(cb => cb.team === 'enemy' && cb.hp > 0);
    if (enemiesRemaining.length === 0) {
      this.endCombat('win');
      return;
    }
    this._nextTurn();
  },

  // ------------------------------------------------------------
  //  Turn Management
  // ------------------------------------------------------------
  async _nextTurn() {
    if (!activeCombat) return;
    const c = activeCombat;
    c.currentTurnIndex++;
    if (c.currentTurnIndex >= c.turnOrder.length) {
      c.currentTurnIndex = 0;
      c.round++;
      this._processEndOfRound();
      this._calculateTurnOrder();
    }
    c.currentCombatant = c.turnOrder[c.currentTurnIndex];
    this.refresh();

    if (c.currentCombatant?.isPlayer) {
      activeCombat.locked = false;
      this.refresh();
    } else if (c.currentCombatant && c.currentCombatant.hp > 0) {
      setTimeout(() => this._processNonPlayerTurn(c.currentCombatant), 500);
    } else {
      this._nextTurn();
    }
  },

  async _processNonPlayerTurn(combatant) {
    if (!activeCombat) return;
    const c = activeCombat;

    await this._processPendingActions(combatant);
    if (combatant.hp <= 0) {
      this.clog(`${combatant.name} has been defeated!`, 'cl-system');
      const idx = c.combatants.findIndex(cb => cb.id === combatant.id);
      if (idx !== -1) c.combatants.splice(idx, 1);
      this._nextTurn();
      return;
    }

    const stunIdx = combatant.statusEffects.findIndex(s => s.type === 'skip');
    if (stunIdx !== -1) {
      combatant.statusEffects[stunIdx].duration--;
      if (combatant.statusEffects[stunIdx].duration <= 0) combatant.statusEffects.splice(stunIdx, 1);
      this.clog(`${combatant.name} is stunned and cannot act!`, 'cl-status');
      this._nextTurn();
      return;
    }

    const { skill, dmg, dodged, target } = this._rollEnemyAction(combatant);
    if (!skill) {
      this.clog(`${combatant.name} holds their position.`, 'cl-system');
      this._nextTurn();
      return;
    }

    if (dodged) {
      this.clog(`${combatant.name}'s ${skill.name} — DODGED!`, 'cl-miss');
      this._nextTurn();
      return;
    }

    if (dmg > 0 && target) {
      let finalDmg = dmg;
      if (target.reflectPercent > 0) {
        const reflectDmg = Math.floor(dmg * target.reflectPercent / 100);
        if (reflectDmg > 0) {
          EffectEngine.execute(combatant, { type: 'damage', value: reflectDmg, target: 'self' }, `${target.name}'s reflection`);
        }
      }
      target.hp = Math.max(0, target.hp - finalDmg);
      if (target.id === 'player') State.hp = target.hp;
      if (window.Sound) Sound.combatHit(false);

      if (target.id === 'player') {
        this.clog(`${combatant.name}'s ${skill.name} — ${finalDmg} dmg to you (${State.hp}/${State.maxHp} HP)`, 'cl-enemy');
        if (State.hp <= 0) {
          this.endCombat('death');
          return;
        }
      } else {
        this.clog(`${combatant.name}'s ${skill.name} — ${finalDmg} dmg to ${target.name} (${target.hp}/${target.maxHp} HP)`, 'cl-enemy');
      }

      if (skill.statusEffect && skill.statusEffect.effects) {
        for (const action of skill.statusEffect.effects) {
          EffectEngine.execute(target, action, skill.name);
        }
        if (skill.statusEffect.duration > 0) {
          target.statusEffects.push({
            name: skill.statusEffect.name,
            description: skill.statusEffect.description,
            duration: skill.statusEffect.duration,
            effects: skill.statusEffect.effects,
            type: 'custom'
          });
        }
      }

      if (target.hp <= 0 && target.team === 'enemy') {
        this.clog(`${target.name} has been defeated!`, 'cl-system');
        activeCombat.defeatedEnemies.push({ name: target.name, id: target.id });
        const idx = c.combatants.findIndex(cb => cb.id === target.id);
        if (idx !== -1) c.combatants.splice(idx, 1);
      }
    }

    this.refresh();
    const enemiesRemaining = c.combatants.filter(cb => cb.team === 'enemy' && cb.hp > 0);
    if (enemiesRemaining.length === 0) {
      this.endCombat('win');
      return;
    }
    if (State.hp <= 0) {
      this.endCombat('death');
      return;
    }
    this._nextTurn();
  },

  _rollEnemyAction(combatant) {
    let available = combatant.skills.filter(s => (s.currentCooldown || 0) === 0);
    if (available.length === 0 && combatant.skills.length === 0) {
      combatant.skills.push({ name: 'Punch', damage: [5,12], energyCost:5, cooldown:0, currentCooldown:0, statusEffect:null });
      available = combatant.skills;
    }
    const skill = available.length ? available[Math.floor(Math.random() * available.length)] : null;
    if (!skill) return { skill: null, dmg: 0, dodged: false, target: null };

    const validTargets = activeCombat.combatants.filter(cb => cb.team !== combatant.team && cb.hp > 0);
    if (validTargets.length === 0) return { skill: null, dmg: 0, dodged: false, target: null };
    const target = validTargets[Math.floor(Math.random() * validTargets.length)];

    const slowDebuff = target.statusEffects.find(s => s.type === 'debuff_agi');
    const effectiveAgi = (target.isPlayer ? State.stats.agi : target.agi) - (slowDebuff ? slowDebuff.value : 0);
    const dodgeChance = Math.max(0, effectiveAgi * 3);
    const dodged = Math.random() * 100 < dodgeChance;
    if (dodged) return { skill, dmg: 0, dodged: true, target };

    const rawDmg = (skill.damage?.[0] || 5) + Math.floor(Math.random() * ((skill.damage?.[1] || 12) - (skill.damage?.[0] || 5) + 1));
    const shield = target.statusEffects.find(s => s.type === 'buff_shield');
    let finalDmg = rawDmg;
    if (shield) {
      const absorbed = Math.min(shield.value, rawDmg);
      finalDmg -= absorbed;
      shield.value -= absorbed;
      if (shield.value <= 0) target.statusEffects = target.statusEffects.filter(s => s !== shield);
    }
    return { skill, dmg: Math.max(0, finalDmg), dodged: false, target };
  },

  async _processPendingActions(combatant) {
    if (!combatant.pendingActions || !combatant.pendingActions.length) return;
    for (let i = 0; i < combatant.pendingActions.length; i++) {
      const action = combatant.pendingActions[i];
      action.remainingDelay--;
      if (action.remainingDelay <= 0) {
        EffectEngine.execute(combatant, action, 'Delayed effect');
        combatant.pendingActions.splice(i, 1);
        i--;
      }
    }
  },

  _processEndOfRound() {
    const c = activeCombat;
    for (const combatant of c.combatants) {
      for (let i = 0; i < combatant.statusEffects.length; i++) {
        const sf = combatant.statusEffects[i];
        if (sf.type === 'dot') {
          const dmg = sf.value || 5;
          combatant.hp = Math.max(0, combatant.hp - dmg);
          if (combatant.id === 'player') State.hp = combatant.hp;
          this.clog(`${sf.name}: ${combatant.name} -${dmg} HP`, 'cl-status');
        } else if (sf.type === 'buff_hp' && combatant.id === 'player') {
          State.hp = Math.min(State.maxHp, State.hp + sf.value);
          combatant.hp = State.hp;
          this.clog(`${sf.name}: +${sf.value} HP`, 'cl-status');
        }
        
        // Skip effects are decremented during turn checks, not at end of round
        if (sf.type === 'skip') {
          continue; // do not decrement or remove here
        }
        
        sf.duration--;
        if (sf.duration <= 0) {
          this.clog(`${sf.name} fades from ${combatant.name}.`, 'cl-system');
          combatant.statusEffects.splice(i, 1);
          i--;
        }
      }

      if (combatant.statModDurations) {
        for (const [stat, dur] of Object.entries(combatant.statModDurations)) {
          if (dur <= 1) {
            delete combatant.statModDurations[stat];
            combatant.tempMods[stat] = 0;
          } else {
            combatant.statModDurations[stat] = dur - 1;
          }
        }
      }

      if (combatant.reflectDuration > 0) {
        combatant.reflectDuration--;
        if (combatant.reflectDuration <= 0) combatant.reflectPercent = 0;
      }

      if (combatant.immunities) {
        combatant.immunities = combatant.immunities.filter(imm => {
          imm.remaining--;
          return imm.remaining > 0;
        });
      }
    }

    Object.keys(c.cooldowns).forEach(key => {
      if (c.cooldowns[key] > 0) c.cooldowns[key]--;
    });
    c.combatants.forEach(cb => {
      cb.skills.forEach(sk => {
        if (sk.currentCooldown > 0) sk.currentCooldown--;
      });
    });

    State.energy = Math.min(State.maxEnergy, State.energy + 5 + Math.floor(State.stats.int / 2));
  },

  // ------------------------------------------------------------
  //  End Combat
  // ------------------------------------------------------------
  endCombat(outcome, fleeResult) {
    const c = activeCombat;
    if (!c) return;
    document.getElementById('combatOverlay').classList.remove('open');
    const defeatedCount = c.defeatedEnemies.length;
    if (outcome === 'win') {
      const baseXp = defeatedCount * 25 + Math.floor(Math.random() * 20);
      Ui.addInstant(`[ COMBAT VICTORY: ${defeatedCount} enemies defeated in ${c.round} rounds ]`, 'system');
      c.defeatedEnemies.forEach(enemy => {
        const deadNpc = State.npcs.find(n => n.name.toLowerCase() === enemy.name.toLowerCase());
        if (deadNpc) deadNpc.relationship = 'Dead';
        else State.npcs.push({ name: enemy.name, relationship: 'Dead', description: `Defeated in combat on Day ${State.gameDay}.` });
      });
      Ui.renderSidebar();
      Llm.send(`[COMBAT WON] Defeated ${defeatedCount} enemies in ${c.round} rounds. Player HP: ${State.hp}/${State.maxHp}. Narrate aftermath and grant ${baseXp} XP.`)
        .then(resp => {
          Engine.applyResponse(resp);
          if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
          const tickerEl = buildTicker(resp, State.hp, State.credits, State.npcs);
          if (tickerEl) document.getElementById('narrativeLog').appendChild(tickerEl);
          StatSystem.gainXp(baseXp);
          const wq = () => { if (Ui.isTyping||Ui.typeQueue.length) setTimeout(wq,200); else { Ui.setInputLocked(false); Ui.updateHeader(); Ui.renderSidebar(); }};
          wq();
        });
    } else if (outcome === 'death') {
      showDeathScreen('You were killed in combat.');
    } else {
      Ui.addInstant(`[ You fled from combat ]`, 'system');
      let fleeContext = fleeResult ? `\nFlee roll: ${fleeResult.roll}/${fleeResult.threshold} needed. AGI: ${fleeResult.agi}.` : '';
      Llm.send(`[COMBAT FLED] Player fled after ${c.round} rounds.${fleeContext} Narrate the escape.`)
        .then(resp => {
          Engine.applyResponse(resp);
          if (resp.narration) Ui.enqueue(resp.narration, 'narrator');
          const tickerEl = buildTicker(resp, State.hp, State.credits, State.npcs);
          if (tickerEl) document.getElementById('narrativeLog').appendChild(tickerEl);
          const wq = () => { if (Ui.isTyping||Ui.typeQueue.length) setTimeout(wq,200); else { Ui.setInputLocked(false); Ui.updateHeader(); Ui.renderSidebar(); }};
          wq();
        });
    }
    activeCombat = null;
  },

  // ------------------------------------------------------------
  //  Combat Chat
  // ------------------------------------------------------------
  async sendCombatChat(message) {
    if (!activeCombat || activeCombat.locked) return;
    const c = activeCombat;
    this.clog(`[YOU] ${message}`, 'cl-player');

    const candidates = c.combatants.filter(cb => cb.team !== 'player' && cb.hp > 0);
    if (candidates.length === 0) return;

    // Ask AI to decide who the message is directed to
    const candidateNames = candidates.map(cb => cb.name).join(', ');
    const routingPrompt = `Combat chat routing. Player says: "${message}"
  Available NPCs: ${candidateNames}
  Which NPC is the player addressing? Reply ONLY with the exact name from the list. If uncertain or addressing everyone, reply with "ALL". If addressing no one in particular, reply with "ANY".`;

    let targetName = null;
    try {
      const raw = await queueRequest(() => callProvider([{ role: 'user', content: routingPrompt }], 50));
      targetName = raw.trim().replace(/[.,!?]/g, '');
    } catch(e) {
      console.warn('Routing AI failed, falling back to random', e);
      targetName = candidates[Math.floor(Math.random() * candidates.length)].name;
    }

    let responder = null;
    if (targetName === 'ALL') {
      // Respond with the first NPC, but log that it's a group address
      responder = candidates[0];
      this.clog(`(message addressed to everyone)`, 'cl-system');
    } else if (targetName === 'ANY') {
      responder = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      responder = candidates.find(cb => cb.name.toLowerCase() === targetName.toLowerCase());
      if (!responder) responder = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const prompt = `Combat dialogue. Player says: "${message}" to ${responder.name}.
  Current situation:
  - Player HP: ${State.hp}/${State.maxHp}
  - ${responder.name} HP: ${responder.hp}/${responder.maxHp}
  - Player CHA: ${State.stats.cha}/10
  - ${responder.name}'s status: ${responder.hp > responder.maxHp * 0.5 ? 'healthy' : 'wounded'}
  - Round: ${c.round}

  Generate a short, in‑character response from ${responder.name}. They can:
  - Attack the player (if hostile)
  - Negotiate (if neutral)
  - Plead for mercy (if wounded)
  - Switch sides (rare, if very wounded or high CHA)
  - Call reinforcements (if losing)

  Reply with JSON: {"response":"their words","action":"attack|negotiate|switch|plead|reinforce","attackTarget":"player|ally|enemy","switchToTeam":"ally|enemy"}`;

    try {
      const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 300));
      const clean = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      const result = JSON.parse(clean);
      this.clog(`[${responder.name}] ${result.response}`, 'cl-enemy');

      switch (result.action) {
        case 'attack':
          const target = result.attackTarget === 'player' ? c.playerObj :
                        c.combatants.find(cb => cb.name.toLowerCase().includes(result.attackTarget));
          if (target && target.hp > 0) await this._enemyAttack(responder, target);
          break;
        case 'switch':
          if (result.switchToTeam) {
            responder.team = result.switchToTeam;
            this.clog(`⚔ ${responder.name} switches sides! Now fighting for ${result.switchToTeam}!`, 'cl-system');
            this._calculateTurnOrder();
          }
          break;
        case 'plead':
          this.clog(`⚠ ${responder.name} pleads for mercy.`, 'cl-system');
          break;
        case 'reinforce':
          this.clog(`⚠ ${responder.name} calls reinforcements!`, 'cl-system');
          this._addReinforcement(responder);
          break;
      }
      this.refresh();
      const enemiesRemaining = c.combatants.filter(cb => cb.team === 'enemy' && cb.hp > 0);
      if (enemiesRemaining.length === 0) this.endCombat('win');
      else if (State.hp <= 0) this.endCombat('death');
      else this._nextTurn();
    } catch(e) {
      console.error('Combat chat error:', e);
      this.clog(`${responder.name} ignores you.`, 'cl-enemy');
      this._nextTurn();
    }
  },

  _addReinforcement(attacker) {
    const c = activeCombat;
    const newEnemy = {
      id: `reinforce_${Date.now()}`,
      name: `${attacker.name}'s Backup`,
      team: 'enemy',
      hp: 30,
      maxHp: 30,
      level: Math.max(1, (attacker.level || 1) - 1),
      description: 'Reinforcement',
      skills: [{ name: 'Punch', damage: [5,10], energyCost:5, cooldown:0, currentCooldown:0, statusEffect:null }],
      statusEffects: [],
      pendingActions: [],
      tempMods: {},
      statModDurations: {},
      reflectPercent: 0,
      reflectDuration: 0,
      immunities: [],
      agi: 5,
      isPlayer: false
    };
    c.combatants.push(newEnemy);
    this._calculateTurnOrder();
  }
};

// ------------------------------------------------------------
//  QTE (Quick Time Event)
// ------------------------------------------------------------
const Qte = {
  active: false,
  timer: null,
  resolve: null,

  trigger(qteData) {
    return new Promise(resolve => {
      this.active = true;
      this.resolve = resolve;

      const overlay = document.getElementById('qteOverlay');
      const promptEl = document.getElementById('qtePrompt');
      const btn = document.getElementById('qteBtn');
      const timerFill = document.getElementById('qteTimerFill');

      promptEl.textContent = qteData.prompt || 'React now!';
      btn.textContent = qteData.action || 'ACT';

      const ms = (qteData.timeLimit || 4) * 1000;
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      overlay.classList.add('open');
      Ui.setInputLocked(true);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        timerFill.style.transition = `width ${ms}ms linear`;
        timerFill.style.width = '0%';
      }));

      this.timer = setTimeout(() => this.finish(false), ms);
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
  }
};

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && Qte.active) {
    e.preventDefault();
    Qte.finish(true);
  }
});