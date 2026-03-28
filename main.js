// main.js – CyberTerm RPG entry point

// ========== Boot & Initialization ==========
async function boot() {
  const status = document.getElementById('bootStatus');
  const steps  = ['LOADING KERNEL...', 'MOUNTING CITY GRID...', 'SYNCING NEURAL MESH...', 'READY.'];
  for (const s of steps) {
    status.textContent = s;
    await new Promise(r => setTimeout(r, 520));
  }
  await new Promise(r => setTimeout(r, 300));
  Ui.showScreen('mainMenuScreen');
}

async function loadClasses() {
  const grid    = document.getElementById('classGrid');
  const classes = await Llm.getClasses();
  window._classData = {};
  classes.forEach(c => { window._classData[c.name] = c; });

  function statBar(label, val, colorClass) {
    const pct = Math.round((val / 10) * 100);
    return `<div class="cs-row">
      <span class="cs-label">${label}</span>
      <div class="cs-bar"><div class="cs-fill ${colorClass}" style="width:${pct}%"></div></div>
      <span class="cs-val">${val}/10</span>
    </div>`;
  }

  grid.innerHTML = classes.map(c => {
    const s   = c.stats || {};
    const hp  = c.startHp      || 100;
    const cr  = c.startCredits || 0;
    const hpWarn = hp < 75 ? 'warn' : '';
    return `<button class="class-btn" data-class="${c.name}">
      <span class="cn">// ${c.name.toUpperCase()} //</span>
      <span class="cd">${c.description}</span>
      <div class="class-stats">
        ${statBar('COMBAT',  s.combat  || 0, 'red')}
        ${statBar('HACKING', s.hacking || 0, '')}
        ${statBar('STEALTH', s.stealth || 0, 'cyan')}
        ${statBar('SOCIAL',  s.social  || 0, 'gold')}
        ${statBar('TECH',    s.tech    || 0, '')}
      </div>
      <div class="class-starting">
        <div class="cs-chip ${hpWarn}">HP <span>${hp}</span></div>
        <div class="cs-chip">CR <span>${cr}</span></div>
      </div>
    </button>`;
  }).join('');

  grid.querySelectorAll('.class-btn').forEach(btn => {
    if (window.Sound) Sound.uiSelect();
    btn.addEventListener('click', () => startGame(btn.dataset.class));
  });
}

async function startGameFromMenu() {
  Ui.showScreen('charCreateScreen');
  initCharCreate();
}

// ========== Character Creation ==========
let ccBackstoryNpcs = [];

const TRAGEDIES = [
  {
    id: 'violence', name: 'VIOLENCE',
    desc: 'Someone put a bullet in something you loved.',
    effect: 'Hardened reflexes. +1 STR, +1 AGI.',
    statBonus: { str:1, agi:1 },
    startItem: { name:'Bloodstained Dog Tags', amount:1, description:'All that remains of them. You never take it off.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'betrayal', name: 'BETRAYAL',
    desc: 'The one person you trusted sold you out.',
    effect: 'You learned to read people before they read you. +2 CHA.',
    statBonus: { cha:2 },
    startItem: { name:'Encrypted Burner', amount:1, description:'You never use the same number twice anymore.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'loss', name: 'LOSS',
    desc: 'The city took someone from you that it had no right to.',
    effect: 'Grief made you harder to kill. +2 END.',
    statBonus: { end:2 },
    startItem: { name:'Faded Photograph', amount:1, description:'A face you carry everywhere. Reminds you why you keep going.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'corruption', name: 'CORRUPTION',
    desc: 'The system made you part of the machine before you knew what was happening.',
    effect: 'You understand how the machine works. +1 INT, +1 TEC.',
    statBonus: { int:1, tec:1 },
    startItem: { name:'Revoked Corp Access Card', amount:1, description:'Flagged as terminated. Still opens the old maintenance doors.', unsellable:true, slot:null, statBonus:null },
  },
];

const UPBRINGINGS = [
  {
    id: 'fixer', name: "FIXER'S WARD", desc: 'A street fixer sees something in you and takes you under their wing.',
    outcomes: {
      critFail:    "The fixer used you and cut you loose the moment you weren't useful. The lesson stuck.",
      bad:         "The fixer burns in a housefire two years later. You inherit their debts and their ghosts.",
      good:        "When the fixer retires, they hand you their contact list. It's worth more than money.",
      critSuccess: "Turns out the fixer was a legend in the shadows. You learned from the best — and they left you everything.",
    },
  },
  {
    id: 'gang', name: 'GANG COLORS', desc: 'A local crew gives you an identity when you had nothing else.',
    outcomes: {
      critFail:    "A sting operation rolls up the whole crew. You barely walk. They blame you for it.",
      bad:         "A rival gang wipes out your crew. You're the only one who makes it out. Nobody's sure if that makes you lucky.",
      good:        "The crew eats the heat on something big and you walk clean. You still owe them — and they know it.",
      critSuccess: "Your crew becomes the most feared in the district. You earn a name that still opens doors.",
    },
  },
  {
    id: 'corp', name: 'CORP PROPERTY', desc: 'A megacorp social program pulls you off the street.',
    outcomes: {
      critFail:    "You were used as a test subject. The experiments left marks you can't explain and scars you don't show.",
      bad:         "The program gets cancelled. You're processed out with a tracker in your neck and debt you never signed.",
      good:        "You learn the corp's language before you bolt. That knowledge is worth more than they ever paid you.",
      critSuccess: "Before you vanish you find dirt on a mid-level exec. Insurance for life — if you play it right.",
    },
  },
  {
    id: 'lone', name: 'LONE DOG', desc: 'Nobody came. You figured it out by yourself.',
    outcomes: {
      critFail:    "The streets hollowed you out. When you finally surfaced, something was missing. You haven't found it since.",
      bad:         "The isolation carved you cold. You survive. But trust is a word you stopped using a long time ago.",
      good:        "The city taught you to move like water. You know every shadow, every back alley, every exit.",
      critSuccess: "You became a ghost. Nobody knows your face. Nobody knows your name. That's exactly how you want it.",
    },
  },
];

function initCharCreate() {
  ccBackstoryNpcs = [];

  const step1 = document.getElementById('ccStep1');
  const stepLocation = document.getElementById('ccStepLocation');
  const step2 = document.getElementById('ccStep2');
  const step3 = document.getElementById('ccStep3');

  step1.style.display = 'flex';
  stepLocation.style.display = 'none';
  step2.style.display = 'none';
  step3.style.display = 'none';

  document.getElementById('ccStepLabel').textContent = 'STEP 1 / 5';
  document.getElementById('ccName').value = '';
  document.getElementById('ccNameError').textContent = '';
  setTimeout(() => document.getElementById('ccName').focus(), 80);
}

// --- Step 1: Name input → go to location step ---
async function handleStep1() {
  const nameVal = document.getElementById('ccName').value.trim();
  const errEl = document.getElementById('ccNameError');

  if (!nameVal) { errEl.textContent = '[ DESIGNATION REQUIRED ]'; return; }
  errEl.textContent = '';

  State.playerName = nameVal;

  document.getElementById('ccStep1').style.display = 'none';
  document.getElementById('ccStepLocation').style.display = 'flex';
  document.getElementById('ccStepLabel').textContent = 'STEP 2 / 5';

  showLocationChoices();
}

// --- Location AI generation ---
async function fetchLocationOptions() {
  const prompt = `Generate exactly 4 gritty cyberpunk DISTRICT names within a single megacity. Each name should be 1-3 words, evocative, like "Rust Alley", "Neon Heights", "Sub-Level 6", "The Sprawl". Respond only with a valid JSON array of strings. No markdown, no commentary.`;
  try {
    const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 300));
    let cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    const locations = JSON.parse(cleaned);
    if (Array.isArray(locations) && locations.length === 4) return locations;
    throw new Error('Invalid response');
  } catch (e) {
    console.warn('Location fetch failed, using fallback:', e);
    return ['Rust Alley', 'Neon Heights', 'Sub-Level 6', 'The Sprawl'];
  }
}

async function showLocationChoices() {
  const grid = document.getElementById('ccLocationGrid');
  const loading = document.getElementById('ccLocationLoading');
  const errorDiv = document.getElementById('ccLocationError');
  const descDiv = document.getElementById('ccLocationDesc');
  if (descDiv) {
    descDiv.style.display = 'none';
    descDiv.innerHTML = '';
  }

  loading.style.display = 'block';
  grid.innerHTML = '';
  errorDiv.textContent = '';

  try {
    const locations = await fetchLocationOptions();
    // Fetch descriptions for all locations
    loading.textContent = 'FETCHING LOCATION DATA...';
    const locationData = [];
    for (const loc of locations) {
      try {
        const descPrompt = `Describe ${loc} as a district within a cyberpunk megacity in one sentence. Gritty, atmospheric. Only the description, no extra text.`;
        const raw = await queueRequest(() => callProvider([{ role: 'user', content: descPrompt }], 100));
        const locationDesc = raw.trim().replace(/^["']|["']$/g, '');
        locationData.push({ name: loc, description: locationDesc });
      } catch (err) {
        console.error(`Failed to fetch description for ${loc}:`, err);
        locationData.push({ name: loc, description: `The neon-slick streets of ${loc} where survival costs more than credits.` });
      }
    }
    
    loading.style.display = 'none';
    // Store descriptions in a map for later use
    window._locationDescriptions = {};
    locationData.forEach(l => { window._locationDescriptions[l.name] = l.description; });
    
    grid.innerHTML = locationData.map(loc => `
      <button class="cc-choice-btn cc-location-btn" data-location="${loc.name}">
        <span class="ccc-name">${loc.name}</span>
      </button>
    `).join('');
    
    // Keep track of selected location
    let selectedLocation = null;
    
    // Show description when a location is clicked
    grid.querySelectorAll('.cc-location-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const chosen = btn.dataset.location;
        // Deselect all buttons
        grid.querySelectorAll('.cc-location-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedLocation = chosen;
        
        // Show the description
        if (descDiv) {
          descDiv.style.display = 'block';
          descDiv.innerHTML = `
            <div style="margin-top: 12px; padding: 12px; border: 1px solid var(--border); background: var(--bg3);">
              <div style="color: var(--green-dim); margin-bottom: 6px;">${chosen}</div>
              <div style="color: var(--text-dim); font-size: 0.9rem;">${window._locationDescriptions[chosen]}</div>
              <button id="confirmLocationBtn" class="cc-next-btn" style="margin-top: 12px;">CONTINUE →</button>
            </div>
          `;
          const confirmBtn = document.getElementById('confirmLocationBtn');
          if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
              State.origin = chosen;
              State.locationDesc = window._locationDescriptions[chosen];
              generateBackstoryAndContinue(State.playerName, chosen);
            });
          }
        } else {
          // fallback if no desc div
          State.origin = chosen;
          State.locationDesc = window._locationDescriptions[chosen];
          generateBackstoryAndContinue(State.playerName, chosen);
        }
      });
    });
  } catch (err) {
    loading.style.display = 'none';
    errorDiv.textContent = 'Failed to load locations. Check your AI connection.';
    console.error(err);
  }
}

// --- Backstory generation with NPCs ---
async function generateBackstory(name, origin, locationDesc) {
  const prompt = `Generate a gritty cyberpunk backstory for a character named ${name} who grew up in ${origin}, a district within a sprawling megacity.
  ${locationDesc ? `Description of ${origin}: ${locationDesc}` : ''}
  Write in second person (you). 3-4 sentences. Dark, noir, atmospheric. Mention specific details about that district and the city around it.
  Also generate 2-3 NPCs from their past (family, old allies, rivals, enemies — people who shaped them).
  Respond ONLY with valid JSON, no markdown:
  {
    "backstory": "your backstory text",
    "npcs": [
      {"name":"string","relationship":"Friendly|Neutral|Hostile|Suspicious","description":"one sentence — who they are and why they matter"}
    ]
  }`;

  const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 500));
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    const result = JSON.parse(cleaned);
    if (result.npcs) {
      result.npcs = result.npcs.map(n => ({
        ...n,
        description: n.description || 'A memory you can\'t shake.',
      }));
    }
    return result;
  } catch(e) {
    const backstoryMatch = raw.match(/"backstory"\s*:\s*"([^"]+)"/);
    return {
      backstory: backstoryMatch ? backstoryMatch[1] : `You came up in ${origin}. The city doesn't care where you're from.`,
      npcs: [],
    };
  }
}

async function generateBackstoryAndContinue(name, origin) {
  document.getElementById('ccStepLocation').style.display = 'none';
  document.getElementById('ccStep2').style.display = 'flex';
  document.getElementById('ccStepLabel').textContent = 'STEP 3 / 5';

  const loadingEl = document.getElementById('ccBackstoryLoading');
  const textEl = document.getElementById('ccBackstoryText');
  const tragedySec = document.getElementById('ccTragedySection');

  loadingEl.style.display = 'block';
  textEl.style.display = 'none';
  tragedySec.style.display = 'none';
  textEl.textContent = '';

  try {
    const result = await generateBackstory(name, origin, State.locationDesc);
    State.backstory = result.backstory || '';
    ccBackstoryNpcs = result.npcs || [];

    loadingEl.style.display = 'none';
    textEl.style.display = 'block';
    await typeIntoElement(textEl, State.backstory);
  } catch (e) {
    State.backstory = `The gutters of ${origin} made you hard before you were old enough to understand why. You learned fast or you didn't learn at all.`;
    loadingEl.style.display = 'none';
    textEl.style.display = 'block';
    textEl.textContent = State.backstory;
  }

  await new Promise(r => setTimeout(r, 400));
  tragedySec.style.display = 'block';
  renderTragedyChoices();
}

function typeIntoElement(el, text) {
  return new Promise(resolve => {
    el.textContent = '';
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        el.scrollTop = el.scrollHeight;
        setTimeout(tick, 14);
      } else {
        resolve();
      }
    };
    tick();
  });
}

function renderTragedyChoices() {
  const grid = document.getElementById('ccTragedyGrid');
  grid.innerHTML = TRAGEDIES.map(t => `
    <button class="cc-choice-btn cc-tragedy-btn" data-id="${t.id}">
      <span class="ccc-name red">${t.name}</span>
      <span class="ccc-desc">${t.desc}</span>
    </button>`).join('');

  grid.querySelectorAll('.cc-tragedy-btn').forEach(btn => {
    btn.addEventListener('click', () => chooseTragedy(btn.dataset.id));
  });
}

async function chooseTragedy(id) {
  const tragedy = TRAGEDIES.find(t => t.id === id);
  State.tragedy = tragedy;

  document.querySelectorAll('.cc-tragedy-btn').forEach(b => {
    b.disabled = true;
    b.style.opacity = b.dataset.id === id ? '1' : '0.3';
  });

  const storyEl = document.getElementById('ccTragedyStory');
  storyEl.style.display = 'block';
  storyEl.innerHTML = '<div class="cc-loading">RECONSTRUCTING MEMORY...</div>';

  let storyText = tragedy.desc;
  try {
    const prompt = `Write exactly 2-3 sentences about how this specific tragedy happened to ${State.playerName}, who grew up in ${State.origin}. Tragedy: ${tragedy.name} — ${tragedy.desc}. Their backstory: ${State.backstory}. Second person. Dark, specific, personal to this character and district. Only the narrative text, nothing else.`;
    const raw = await queueRequest(() => callProvider([{ role:'user', content:prompt }], 200));
    storyText = raw.trim().replace(/^["']|["']$/g, '');
  } catch(e) {
    storyText = tragedy.desc;
  }

  storyEl.innerHTML = `
    <div class="tragedy-reveal">
      <div class="tragedy-reveal-name">${tragedy.name}</div>
      <div class="tragedy-reveal-text">${storyText}</div>
      <div class="tragedy-reveal-effect">${tragedy.effect}</div>
      <button id="tragedyContinueBtn" class="cc-next-btn" style="margin-top:12px;">CONTINUE →</button>
    </div>`;

  document.getElementById('tragedyContinueBtn').addEventListener('click', () => {
    document.getElementById('ccStep2').style.display = 'none';
    document.getElementById('ccStep3').style.display = 'flex';
    document.getElementById('ccStepLabel').textContent = 'STEP 4 / 5';
    renderUpbringingChoices();
  });
}

function renderUpbringingChoices() {
  const grid = document.getElementById('ccUpbringingGrid');
  grid.innerHTML = UPBRINGINGS.map(u => `
    <button class="cc-choice-btn cc-upbringing-btn" data-id="${u.id}">
      <span class="ccc-name">${u.name}</span>
      <span class="ccc-desc">${u.desc}</span>
    </button>`).join('');

  grid.querySelectorAll('.cc-upbringing-btn').forEach(btn => {
    btn.addEventListener('click', () => chooseUpbringing(btn.dataset.id));
  });
}

async function chooseUpbringing(id) {
  const upbringing = UPBRINGINGS.find(u => u.id === id);

  document.querySelectorAll('.cc-upbringing-btn').forEach(b => {
    b.disabled = true;
    b.style.opacity = b.dataset.id === id ? '1' : '0.3';
  });

  const diceSection = document.getElementById('ccDiceSection');
  diceSection.style.display = 'flex';

  const roll = await animateDiceRoll();
  State.upbringingRoll = roll;

  let outcome;
  if (roll <= 3)       outcome = upbringing.outcomes.critFail;
  else if (roll <= 8)  outcome = upbringing.outcomes.bad;
  else if (roll <= 15) outcome = upbringing.outcomes.good;
  else                 outcome = upbringing.outcomes.critSuccess;

  State.upbringing = { ...upbringing, result: outcome };

  const resultEl = document.getElementById('ccDiceResult');
  resultEl.textContent = '';
  resultEl.style.display = 'block';
  await typeIntoElement(resultEl, outcome);

  await new Promise(r => setTimeout(r, 600));
  document.getElementById('ccFinishBtn').style.display = 'block';
}

function animateDiceRoll() {
  return new Promise(resolve => {
    const display  = document.getElementById('ccDiceDisplay');
    const finalRoll = Math.floor(Math.random() * 20) + 1;
    let cycles = 0;
    const maxCycles = 22;

    display.className = 'cc-dice-roll';

    const tick = () => {
      if (cycles < maxCycles) {
        display.textContent = Math.floor(Math.random() * 20) + 1;
        cycles++;
        setTimeout(tick, 40 + (cycles / maxCycles) * 220);
      } else {
        display.textContent = finalRoll;
        if (finalRoll <= 3)       display.className = 'cc-dice-roll roll-crit-fail';
        else if (finalRoll <= 8)  display.className = 'cc-dice-roll roll-fail';
        else if (finalRoll <= 15) display.className = 'cc-dice-roll roll-good';
        else                      display.className = 'cc-dice-roll roll-crit';
        resolve(finalRoll);
      }
    };

    tick();
  });
}

async function finishCharCreate() {
  const btn = document.getElementById('ccFinishBtn');
  btn.disabled = true;
  btn.textContent = 'LOADING...';

  try {
    document.getElementById('classGrid').innerHTML = '<div class="class-btn-loading">QUERYING NEURAL MATRIX...</div>';
    Ui.showScreen('classScreen');
    await loadClasses();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'PROCEED TO CLASS SELECTION ▶';
  }
}

async function startGame(chosenClass) {
  const cd          = window._classData?.[chosenClass] || {};
  State.playerClass = chosenClass;
  State.hp          = cd.startHp      || 100;
  State.credits     = cd.startCredits || 0;

  Ui.showScreen('gameScreen');
  Ui.updateHeader();
  Ui.renderSidebar();

  State.traits     = [];
  State.skills     = [];
  State.statPoints = 5;
  State.level      = 1;
  State.xp         = 0;
  State.xpToNext   = 100;
  State.maxHp      = State.hp;
  State.energy     = 70;
  State.maxEnergy  = 70;

  State.location = State.origin;

  // Add backstory NPCs with descriptions
  if (ccBackstoryNpcs && ccBackstoryNpcs.length) {
    State.npcs = ccBackstoryNpcs.map(n => ({ ...n }));
  }
  
  State.npcs.push({
    name: 'V',
    relationship: 'Neutral',
    description: "Your old buddy, but you're not close anymore. V runs a small fixer network from a cramped data den in the Glitch Sector. They specialize in information brokerage, not just package delivery."
  });

  Ui.setInputLocked(true);

  const hasBackstory = State.backstory && State.tragedy && State.upbringing;

  State.history.push({ role:'assistant', content: JSON.stringify({ narration: "The game begins..." }) });

  const backstoryContext = hasBackstory ? `
PLAYER IDENTITY:
- Name: ${State.playerName}
- Grew up in: ${State.origin}
- Backstory: ${State.backstory}
- Defining tragedy: ${State.tragedy.name} — ${State.tragedy.desc} | Mechanical effect: ${State.tragedy.effect} | Let this surface naturally in quests, NPC reactions, and world details. Do not force it every turn.
- Upbringing: ${State.upbringing.name} (d20 roll: ${State.upbringingRoll}/20) — ${State.upbringing.result}
- Known contacts from past: ${ccBackstoryNpcs.map(n => `${n.name} (${n.relationship})`).join(', ') || 'none yet'}

The opening scene should feel personal to ${State.playerName}'s history. The tragedy and upbringing should subtly shape the AI's tone toward this character.
DO NOT add the backstory NPCs again — they are already in the known contacts list.` : '';

  const traitPrompt = `The player just chose the class "${chosenClass}" and the game is beginning. This is the FIRST and ONLY turn for the following required fields:
${backstoryContext}

1. "traits": array with 1 trait (10% chance of 2). Format: ["TraitName||description"]. The trait should feel earned given the backstory.

2. "initialStats": object with keys str, agi, int, cha, tec, end. Total must be exactly 28 points. Distribute by ${chosenClass} archetype.

3. "initialSkills": 3-4 skills unique to the class. Each needs: name, description, damage [min,max] or null, energyCost, cooldown, statScaling, statusEffect.

4. "addItems": starting items. MUST include at least one class-specific item with "unsellable": true.

5. "narration": 2-3 sentences setting the scene in ${State.origin} (${State.locationDesc}). The player is starting their journey there. Use their backstory and tragedy to set the mood. Do NOT mention The Circuit Breaker unless it fits the district.

Do not omit these fields — the game depends on them.`;

  const resp = await Llm.send(traitPrompt, 'FIRST_TURN=true', 1600);
  Engine.applyResponse(resp);

  if (State.tragedy && State.tragedy.statBonus) {
    Object.entries(State.tragedy.statBonus).forEach(([k, v]) => {
      if (State.stats[k] !== undefined) State.stats[k] = Math.min(10, State.stats[k] + v);
    });
    State.maxHp     = StatSystem.calcMaxHp();
    State.hp        = Math.min(State.hp, State.maxHp);
    State.maxEnergy = StatSystem.calcMaxEnergy();
    State.energy    = Math.min(State.energy, State.maxEnergy);
  }
  if (State.tragedy && State.tragedy.startItem) {
    const alreadyHas = State.inventory.find(i => i.name === State.tragedy.startItem.name);
    if (!alreadyHas) State.inventory.push({ ...State.tragedy.startItem });
  }

  if (State.hp <= 0) checkDeath(resp.deathReason || 'Your actions led to your demise...');

  await new Promise(r => setTimeout(r, 100));

  if (resp.narration) Ui.enqueue(resp.narration, 'narrator');

  const waitForQueue = () => {
    if (Ui.isTyping || Ui.typeQueue.length) {
      setTimeout(waitForQueue, 200);
    } else {
      Ui.setInputLocked(false);
      Ui.updateHeader();
      Ui.renderSidebar();
    }
  };
  setTimeout(waitForQueue, 500);
}

async function handlePlayerInput() {
  const input = document.getElementById('playerInput');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  Ui.addInstant(text, 'player');
  if (window.Sound) Sound.send();
  Ui.setInputLocked(true);

  const prevHp      = State.hp;
  const prevCredits = State.credits;
  const prevNpcs    = State.npcs.map(n => ({ ...n }));

  __lastStateSnapshot = JSON.parse(JSON.stringify(State));
  __lastLogSnapshot = document.getElementById('narrativeLog').innerHTML;

  const resp = await Llm.send(text);
  Engine.applyResponse(resp);
  advanceTime();

  if (resp.narration) Ui.enqueue(resp.narration, 'narrator');

  const waitForQueue = async () => {
    if (Ui.isTyping || Ui.typeQueue.length) {
      setTimeout(waitForQueue, 200);
      return;
    }

    const tickerEl = buildTicker(resp, prevHp, prevCredits, prevNpcs);
    if (tickerEl) {
      document.getElementById('narrativeLog').appendChild(tickerEl);
      document.getElementById('narrativeLog').scrollTop = 999999;
    }
    Ui.updateHeader();
    Ui.renderSidebar();

    if (resp.qte && resp.qte.prompt) {
      const success = await Qte.trigger(resp.qte);
      const qteResp = success ? resp.qte.successNarration : resp.qte.failNarration;
      const hpDelta = success ? (resp.qte.successHpDelta || 0) : (resp.qte.failHpDelta || -15);

      if (hpDelta !== 0) {
        State.hp = Math.max(0, Math.min(State.maxHp, State.hp + hpDelta));
        Ui.updateHeader();
      }

      if (qteResp) {
        Ui.enqueue(qteResp, 'narrator');
        await new Promise(r => {
          const check = () => {
            if (Ui.isTyping || Ui.typeQueue.length) setTimeout(check, 200);
            else r();
          };
          check();
        });
      }

      const resultChip = hpDelta !== 0
        ? `<span class="tick-chip ${hpDelta > 0 ? 'pos' : 'neg'}"><span class="tick-icon">♥</span>${hpDelta > 0 ? '+' : ''}${hpDelta} HP</span>`
        : '';
      const outcomeChip = `<span class="tick-chip ${success ? 'pos' : 'neg'}">${success ? '✔ SUCCESS' : '✘ FAILED'}</span>`;
      const qteTicker = document.createElement('div');
      qteTicker.className = 'event-ticker';
      qteTicker.innerHTML = outcomeChip + resultChip;
      document.getElementById('narrativeLog').appendChild(qteTicker);
      document.getElementById('narrativeLog').scrollTop = 999999;
      Ui.updateHeader();
      Ui.renderSidebar();
    }

    if (Engine.pendingCombat) {
      const pc = Engine.pendingCombat;
      Engine.pendingCombat = null;
      setTimeout(() => CombatEngine.start(pc), 400);
      return;
    }

    Ui.setInputLocked(false);
  };
  setTimeout(waitForQueue, 300);
}

async function refreshLastResponse() {
  if (!window.__lastUserMessage) {
    Ui.addInstant('No previous action to refresh.', 'system');
    return false;
  }

  if (__lastStateSnapshot) Object.assign(State, JSON.parse(JSON.stringify(__lastStateSnapshot)));

  if (__lastLogSnapshot) {
    const log = document.getElementById('narrativeLog');
    log.innerHTML = __lastLogSnapshot;
    log.scrollTop = log.scrollHeight;
  }

  if (State.history.length > 0 && State.history[State.history.length - 1].role === 'assistant') {
    State.history.pop();
  }

  const lastTicker = document.querySelector('#narrativeLog .event-ticker:last-child');
  if (lastTicker) lastTicker.remove();

  Ui.addInstant('⟳ REFRESHING NEURAL OUTPUT...', 'system');

  const prevHp      = State.hp;
  const prevCredits = State.credits;
  const prevNpcs    = State.npcs.map(n => ({ ...n }));

  const resp = await Llm.send(window.__lastUserMessage, window.__lastExtraContext || 'REFRESH: regenerate differently');
  Engine.applyResponse(resp);

  if (resp.narration) Ui.enqueue(resp.narration, 'narrator');

  const waitForQueue = () => {
    if (Ui.isTyping || Ui.typeQueue.length) {
      setTimeout(waitForQueue, 200);
    } else {
      const tickerEl = buildTicker(resp, prevHp, prevCredits, prevNpcs);
      if (tickerEl) {
        document.getElementById('narrativeLog').appendChild(tickerEl);
        document.getElementById('narrativeLog').scrollTop = 999999;
      }
      Ui.updateHeader();
      Ui.renderSidebar();
    }
  };
  setTimeout(waitForQueue, 100);

  return true;
}

// ========== DEATH HANDLING ==========
let isDead = false;
let deathCause = '';
let __lastStateSnapshot = null;
let __lastLogSnapshot   = null;

// ASCII skull made of 1s and 0s
const SKULL_BINARY = [
  "   00111111111111111100   ",
  "  0111111111111111111110  ",
  " 011111001111111100111110 ",
  " 011110001111111100011110 ",
  "01111000011111111000011110",
  "01111000011111111000011110",
  "01111000011111111000011110",
  " 011111001111111100111110 ",
  " 011111111111111111111110 ",
  " 001111111111111111111100 ",
  "  0011111111111111111100  ",
  "   00011111111111111000   ",
  "     0011111111111000     ",
  "       011111111110       ",
  "         01111110         ",
  "          011110          ",
  "           1111           ",
];

function showDeathScreen(cause) {
  if (isDead) return;
  isDead = true;
  deathCause = cause;

  Ui.setInputLocked(true);
  if (Ui.typingTimer) clearTimeout(Ui.typingTimer);
  Ui.typeQueue = [];
  Ui.isTyping  = false;

  const deathMsgEl   = document.getElementById('deathMessage');
  const deathOverlay = document.getElementById('deathOverlay');
  const skullAscii   = document.getElementById('skullAscii');

  if (deathMsgEl) deathMsgEl.textContent = cause;

  // Render binary skull
  if (skullAscii) {
    skullAscii.innerHTML = SKULL_BINARY.map(row => row.replace(/1/g, '1').replace(/0/g, '0')).join('\n');
  }

  if (deathOverlay) deathOverlay.classList.add('open');
}

function checkDeath(reason) {
  if (State.hp <= 0 && !isDead) {
    showDeathScreen(reason);
    return true;
  }
  return false;
}

// ========== Event Wiring ==========
document.addEventListener('DOMContentLoaded', () => {
  Ui.initVisibilityHandling();

  document.getElementById('restartBtn').addEventListener('click', () => {
    isDead = false;
    location.reload();
  });

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      const slots = SaveLoad.slots();
      if (slots.length === 0) {
        Ui.addInstant('No saved game found. Start a new game first.', 'system');
        return;
      }
      const latest  = slots[0];
      const success = SaveLoad.load(latest.name);
      if (!success) Ui.addInstant('Failed to load save. The save file may be corrupted.', 'system');
    });
  }

  // ---------- Character Creation Wiring ----------
  const ccStep1Btn = document.getElementById('ccStep1Btn');
  if (ccStep1Btn) ccStep1Btn.addEventListener('click', handleStep1);

  const ccNameInput = document.getElementById('ccName');
  if (ccNameInput) {
    ccNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleStep1(); });
  }

  const ccFinishBtn = document.getElementById('ccFinishBtn');
  if (ccFinishBtn) ccFinishBtn.addEventListener('click', finishCharCreate);

  const ccBackBtn = document.getElementById('ccBackBtn');
  if (ccBackBtn) ccBackBtn.addEventListener('click', () => Ui.showScreen('mainMenuScreen'));

  // ---------- Settings Panel ----------
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose   = document.getElementById('settingsClose');
  const settingsSave    = document.getElementById('settingsSave');
  const settingsMsg     = document.getElementById('settingsMsg');

  function openSettings() {
    const ollamaUrl = document.getElementById('cfgOllamaUrl');
    if (ollamaUrl) ollamaUrl.value = OLLAMA_CONFIG.url;
    const ollamaModel = document.getElementById('cfgOllamaModel');
    if (ollamaModel) ollamaModel.value = OLLAMA_CONFIG.model;
    const openAiKey = document.getElementById('cfgOpenAiKey');
    if (openAiKey) openAiKey.value = OPENAI_CONFIG.apiKey;
    const openAiModel = document.getElementById('cfgOpenAiModel');
    if (openAiModel) openAiModel.value = OPENAI_CONFIG.model;
    const groqKey = document.getElementById('cfgGroqKey');
    if (groqKey) groqKey.value = GROQ_CONFIG.apiKey;
    const groqModel = document.getElementById('cfgGroqModel');
    if (groqModel) groqModel.value = GROQ_CONFIG.model;
    const openrouterKey = document.getElementById('cfgOpenrouterKey');
    if (openrouterKey) openrouterKey.value = OPENROUTER_CONFIG.apiKey;
    const openrouterModel = document.getElementById('cfgOpenrouterModel');
    if (openrouterModel) openrouterModel.value = OPENROUTER_CONFIG.model;
    const geminiKey = document.getElementById('cfgGeminiKey');
    if (geminiKey) geminiKey.value = GEMINI_CONFIG.apiKey;
    const geminiModel = document.getElementById('cfgGeminiModel');
    if (geminiModel) geminiModel.value = GEMINI_CONFIG.model;
    const qwenKey = document.getElementById('cfgQwenKey');
    if (qwenKey) qwenKey.value = QWEN_CONFIG.apiKey;
    const qwenModel = document.getElementById('cfgQwenModel');
    if (qwenModel) qwenModel.value = QWEN_CONFIG.model;
    const deepseekKey = document.getElementById('cfgDeepseekKey');
    if (deepseekKey) deepseekKey.value = DEEPSEEK_CONFIG.apiKey;
    const deepseekModel = document.getElementById('cfgDeepseekModel');
    if (deepseekModel) deepseekModel.value = DEEPSEEK_CONFIG.model;

    const providerIds = ['provGroq','provOllama','provOpenAI','provOpenrouter','provGemini','provQwen','provDeepseek'];
    providerIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('active', AI_PROVIDER === id.replace('prov','').toLowerCase());
    });

    const fields = { groq:'groqFields', ollama:'ollamaFields', openai:'openaiFields', openrouter:'openrouterFields', gemini:'geminiFields', qwen:'qwenFields', deepseek:'deepseekFields' };
    Object.entries(fields).forEach(([p, fid]) => {
      const el = document.getElementById(fid);
      if (el) el.style.display = AI_PROVIDER === p ? 'flex' : 'none';
    });

    if (settingsMsg) settingsMsg.textContent = '';
    settingsOverlay.classList.add('open');
  }

  function closeSettings() { settingsOverlay.classList.remove('open'); }

  const menuSettingsBtn = document.getElementById('menuSettingsBtn');
  if (menuSettingsBtn) menuSettingsBtn.addEventListener('click', openSettings);
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
  }

  function setProvider(p) {
    AI_PROVIDER = p;
    const providerIds = ['provGroq','provOllama','provOpenAI','provOpenrouter','provGemini','provQwen','provDeepseek'];
    providerIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('active', id.replace('prov','').toLowerCase() === p);
    });
    const fields = { groq:'groqFields', ollama:'ollamaFields', openai:'openaiFields', openrouter:'openrouterFields', gemini:'geminiFields', qwen:'qwenFields', deepseek:'deepseekFields' };
    Object.entries(fields).forEach(([key, fid]) => {
      const el = document.getElementById(fid);
      if (el) el.style.display = p === key ? 'flex' : 'none';
    });
    const qwenModel = document.getElementById('cfgQwenModel');
    if (qwenModel) qwenModel.value = QWEN_CONFIG.model;
    const deepseekModel = document.getElementById('cfgDeepseekModel');
    if (deepseekModel) deepseekModel.value = DEEPSEEK_CONFIG.model;
  }

  ['provGroq','provOllama','provOpenAI','provOpenrouter','provGemini','provQwen','provDeepseek'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => setProvider(id.replace('prov','').toLowerCase()));
  });

  if (settingsSave) {
    settingsSave.addEventListener('click', () => {
      const groqKey          = document.getElementById('cfgGroqKey')?.value.trim() || '';
      const groqModel        = document.getElementById('cfgGroqModel')?.value.trim() || '';
      const ollamaUrl        = document.getElementById('cfgOllamaUrl')?.value.trim() || '';
      const ollamaModel      = document.getElementById('cfgOllamaModel')?.value.trim() || '';
      const openaiKey        = document.getElementById('cfgOpenAiKey')?.value.trim() || '';
      const openaiModel      = document.getElementById('cfgOpenAiModel')?.value.trim() || '';
      const openrouterKey    = document.getElementById('cfgOpenrouterKey')?.value.trim() || '';
      const openrouterModel  = document.getElementById('cfgOpenrouterModel')?.value.trim() || '';
      const geminiKey        = document.getElementById('cfgGeminiKey')?.value.trim() || '';
      const geminiModel      = document.getElementById('cfgGeminiModel')?.value.trim() || '';
      const qwenKey          = document.getElementById('cfgQwenKey')?.value.trim() || '';
      const qwenModel        = document.getElementById('cfgQwenModel')?.value.trim() || '';
      const deepseekKey      = document.getElementById('cfgDeepseekKey')?.value.trim() || '';
      const deepseekModel    = document.getElementById('cfgDeepseekModel')?.value.trim() || '';

      const needsKey = { groq:groqKey, openai:openaiKey, openrouter:openrouterKey, gemini:geminiKey, qwen:qwenKey, deepseek:deepseekKey };
      if (needsKey[AI_PROVIDER] === '' && AI_PROVIDER !== 'ollama') {
        if (settingsMsg) { settingsMsg.textContent = `API KEY REQUIRED FOR ${AI_PROVIDER.toUpperCase()}`; settingsMsg.className = 'settings-msg err'; }
        return;
      }

      GROQ_CONFIG.apiKey        = groqKey;
      GROQ_CONFIG.model         = groqModel        || GROQ_CONFIG.model;
      OLLAMA_CONFIG.url         = ollamaUrl        || OLLAMA_CONFIG.url;
      OLLAMA_CONFIG.model       = ollamaModel      || OLLAMA_CONFIG.model;
      OPENAI_CONFIG.apiKey      = openaiKey;
      OPENAI_CONFIG.model       = openaiModel      || OPENAI_CONFIG.model;
      OPENROUTER_CONFIG.apiKey  = openrouterKey;
      OPENROUTER_CONFIG.model   = openrouterModel  || OPENROUTER_CONFIG.model;
      GEMINI_CONFIG.apiKey      = geminiKey;
      GEMINI_CONFIG.model       = geminiModel      || GEMINI_CONFIG.model;
      QWEN_CONFIG.apiKey        = qwenKey;
      QWEN_CONFIG.model         = qwenModel        || QWEN_CONFIG.model;
      DEEPSEEK_CONFIG.apiKey = deepseekKey;
      DEEPSEEK_CONFIG.model  = deepseekModel || DEEPSEEK_CONFIG.model;

      saveAiConfig();
      const activeModel = { groq:GROQ_CONFIG.model, openai:OPENAI_CONFIG.model, openrouter:OPENROUTER_CONFIG.model, gemini:GEMINI_CONFIG.model, ollama:OLLAMA_CONFIG.model, qwen:QWEN_CONFIG.model, deepseek:DEEPSEEK_CONFIG.model }[AI_PROVIDER];
      if (settingsMsg) { settingsMsg.textContent = `SAVED — ${AI_PROVIDER.toUpperCase()} / ${activeModel}`; settingsMsg.className = 'settings-msg ok'; }
    });
  }

  // ---------- Sound Toggles ----------
  const soundOn  = document.getElementById('soundOn');
  const soundOff = document.getElementById('soundOff');
  if (soundOn && soundOff) {
    soundOn.addEventListener('click',  () => { if (window.Sound) Sound.enable(true);  soundOn.classList.add('active');  soundOff.classList.remove('active'); });
    soundOff.addEventListener('click', () => { if (window.Sound) Sound.enable(false); soundOff.classList.add('active'); soundOn.classList.remove('active'); });
    if (window.Sound) soundOn.classList.add('active');
  }

  // ---------- Combat Narration Toggle ----------
  const cnOn  = document.getElementById('combatNarrOn');
  const cnOff = document.getElementById('combatNarrOff');
  if (cnOn && cnOff) {
    cnOn.addEventListener('click',  () => { COMBAT_NARRATION_ENABLED = true;  cnOn.classList.add('active');  cnOff.classList.remove('active'); });
    cnOff.addEventListener('click', () => { COMBAT_NARRATION_ENABLED = false; cnOff.classList.add('active'); cnOn.classList.remove('active'); });
    cnOff.classList.add('active');
  }

  // ---------- Save/Load Modal ----------
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
        const action = btn.dataset.action;
        const name   = btn.dataset.name;
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

  const saveBtn  = document.getElementById('saveBtn');
  if (saveBtn)  saveBtn.addEventListener('click',  () => showModal('save'));
  const loadBtn  = document.getElementById('loadBtn');
  if (loadBtn)  loadBtn.addEventListener('click',  () => showModal('load'));
  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.addEventListener('click', () => modalOverlay?.classList.remove('open'));
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });
  }
  const modalSaveConfirm = document.getElementById('modalSaveConfirm');
  if (modalSaveConfirm) {
    modalSaveConfirm.addEventListener('click', () => {
      const name = saveInput?.value.trim();
      if (!name) { if (modalMsg) { modalMsg.textContent = 'ENTER A NAME'; modalMsg.className = 'modal-msg err'; } return; }
      if (!State.playerClass) { if (modalMsg) { modalMsg.textContent = 'START A GAME FIRST'; modalMsg.className = 'modal-msg err'; } return; }
      SaveLoad.save(name);
      if (modalMsg) { modalMsg.textContent = `SAVED AS "${name.toUpperCase()}"`; modalMsg.className = 'modal-msg ok'; }
      if (saveInput) saveInput.value = '';
      renderModalSlots('save');
    });
  }
  if (saveInput) {
    saveInput.addEventListener('keydown', e => { if (e.key === 'Enter') modalSaveConfirm?.click(); });
  }

  // ---------- Sidebar Tabs ----------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.Sound) Sound.uiSelect();
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabPanel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (tabPanel) tabPanel.classList.add('active');
    });
  });

  // ---------- Mobile Sidebar Toggle ----------
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (mobileSidebarToggle && sidebar) {
    mobileSidebarToggle.addEventListener('click', () => sidebar.classList.toggle('drawer-open'));
    const narrativePane = document.getElementById('narrativePane');
    if (narrativePane) {
      narrativePane.addEventListener('click', () => {
        if (sidebar.classList.contains('drawer-open')) sidebar.classList.remove('drawer-open');
      });
    }
  }

  // ---------- Dev Console ----------
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
        if (Console.history.length) { Console.histIdx = Math.min(Console.histIdx + 1, Console.history.length - 1); consoleInput.value = Console.history[Console.histIdx]; }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        Console.histIdx = Math.max(Console.histIdx - 1, -1);
        consoleInput.value = Console.histIdx === -1 ? '' : Console.history[Console.histIdx];
      }
    });
  }

  // ---------- Binary Rain ----------
  let rainInterval = null;
  function startBinaryRain() {
    const container = document.getElementById('binaryRain');
    if (!container) return;
    if (rainInterval) clearInterval(rainInterval);
    container.innerHTML = '';
    const maxLeft = container.clientWidth - 20;
    for (let i = 0; i < 300; i++) {
      const d   = document.createElement('div');
      d.className   = 'binary-digit';
      d.textContent = Math.random() > 0.5 ? '1' : '0';
      d.style.left  = `${Math.random() * maxLeft}px`;
      const dur = 3 + Math.random() * 9;
      d.style.animationDuration = `${dur}s`;
      d.style.animationDelay    = `-${Math.random() * dur}s`;
      d.style.fontSize          = `${12 + Math.floor(Math.random() * 8)}px`;
      d.style.opacity           = 0.4 + Math.random() * 0.5;
      container.appendChild(d);
    }
    rainInterval = setInterval(() => {
      if (!container.isConnected) { clearInterval(rainInterval); return; }
      if (container.querySelectorAll('.binary-digit').length < 280) {
        for (let i = 0; i < 5; i++) {
          const d   = document.createElement('div');
          d.className   = 'binary-digit';
          d.textContent = Math.random() > 0.5 ? '1' : '0';
          d.style.left  = `${Math.random() * maxLeft}px`;
          const dur = 3 + Math.random() * 9;
          d.style.animationDuration = `${dur}s`;
          d.style.animationDelay    = `-${Math.random() * dur}s`;
          d.style.fontSize          = `${12 + Math.floor(Math.random() * 8)}px`;
          d.style.opacity           = 0.4 + Math.random() * 0.5;
          container.appendChild(d);
        }
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

  // ---------- Item Popup ----------
  const itemPopupClose = document.getElementById('itemPopupClose');
  if (itemPopupClose) {
    itemPopupClose.addEventListener('click', () => document.getElementById('itemPopup')?.classList.remove('open'));
  }
  const itemPopup = document.getElementById('itemPopup');
  if (itemPopup) {
    itemPopup.addEventListener('click', e => { if (e.target === itemPopup) itemPopup.classList.remove('open'); });
  }

  // ---------- Back to Menu Buttons ----------
  const backToMenuBtn = document.getElementById('backToMenuBtn');
  if (backToMenuBtn) backToMenuBtn.addEventListener('click', () => Ui.showScreen('mainMenuScreen'));

  // ---------- Start Game Button ----------
  const menuStartBtn = document.getElementById('menuStartBtn');
  if (menuStartBtn) menuStartBtn.addEventListener('click', startGameFromMenu);

  // ---------- Player Input ----------
  const sendBtn    = document.getElementById('sendBtn');
  if (sendBtn)     sendBtn.addEventListener('click', handlePlayerInput);
  const playerInput = document.getElementById('playerInput');
  if (playerInput) {
    playerInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
    playerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (e.shiftKey) return;
        e.preventDefault();
        handlePlayerInput();
      }
    });
  }

  // ---------- Refresh Button ----------
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
