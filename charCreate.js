// charCreate.js

let classData = {};
let locationDescriptions = {};
let ccBackstoryNpcs = [];

function statBar(label, val, colorClass) {
  const pct = Math.min(100, val);
  return `<div class="cs-row">
    <span class="cs-label">${label}</span>
    <div class="cs-bar"><div class="cs-fill ${colorClass}" style="width:${pct}%"></div></div>
    <span class="cs-val">${val}</span>
  </div>`;
}

const TRAGEDIES = [
  {
    id: 'violence', name: 'VIOLENCE',
    desc: 'Someone put a bullet in someone you loved. You watched them fall. You never saw the shooter\'s face.',
    effect: 'Hardened reflexes from that night. +1 STR, +1 AGI.',
    statBonus: { str:1, agi:1 },
    startItem: { name:'Bloodstained Photo', amount:1, description:'The last picture of them. You don\'t know who pulled the trigger. But you will find out.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'betrayal', name: 'BETRAYAL',
    desc: 'Someone sold your family out. You don\'t know who. You only know the result.',
    effect: 'You learned to read people before they read you. +2 CHA.',
    statBonus: { cha:2 },
    startItem: { name:'Encrypted Datachip', amount:1, description:'The only clue you have. Someone knows who betrayed your family.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'loss', name: 'LOSS',
    desc: 'They took your family from you. Just another job to whoever did it. Everything to you.',
    effect: 'Grief made you harder to kill. +2 END.',
    statBonus: { end:2 },
    startItem: { name:'Faded Photograph', amount:1, description:'Your family. The only thing you managed to save.', unsellable:true, slot:null, statBonus:null },
  },
  {
    id: 'corruption', name: 'CORRUPTION',
    desc: 'You worked for the people who hired them. You saw what they did. You ran.',
    effect: 'You understand how the machine works. +1 INT, +1 TEC.',
    statBonus: { int:1, tec:1 },
    startItem: { name:'Revoked Arasaka ID', amount:1, description:'Your old corporate badge. You know the job came from inside. Someone gave the order.', unsellable:true, slot:null, statBonus:null },
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

  document.getElementById('ccStep1').style.display        = 'flex';
  document.getElementById('ccStepLocation').style.display = 'none';
  document.getElementById('ccStepClass').style.display    = 'none';
  document.getElementById('ccStep2').style.display        = 'none';
  document.getElementById('ccStep3').style.display        = 'none';

  document.getElementById('ccStepLabel').textContent = 'STEP 1 / 6';
  document.getElementById('ccName').value            = '';
  document.getElementById('ccNameError').textContent = '';
  setTimeout(() => document.getElementById('ccName').focus(), 80);
}

async function handleStep1() {
  const nameVal = document.getElementById('ccName').value.trim();
  const errEl   = document.getElementById('ccNameError');

  if (!nameVal) { errEl.textContent = '[ DESIGNATION REQUIRED ]'; return; }
  errEl.textContent = '';

  State.playerName = nameVal;

  document.getElementById('ccStep1').style.display        = 'none';
  document.getElementById('ccStepLocation').style.display = 'flex';
  document.getElementById('ccStepLabel').textContent      = 'STEP 2 / 6';

  showLocationChoices();
}

async function fetchLocationOptions() {
  const prompt = `Generate exactly 4 gritty cyberpunk DISTRICT names within a single megacity.
Player name is "${State.playerName}". Let this name influence the district names (e.g., if the name sounds sharp, maybe districts have sharper names; if it's mysterious, make them enigmatic).
Each name must be 2-4 words, evocative, and NOT include any of these: "Ironhaven", "Shadowbrook", "The Pit", "Darkside Towers", "Rust Alley", "Neon Heights", "Sub-Level 6", "The Sprawl".
Make them completely new and varied. Avoid industrial themes for all of them.
Respond only with a valid JSON array of strings. No markdown, no commentary.`;
  try {
    const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 300));
    let cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    const locations = JSON.parse(cleaned);
    if (Array.isArray(locations) && locations.length === 4) return locations;
    throw new Error('Invalid response');
  } catch (e) {
    console.warn('Location fetch failed, using fallback:', e);
    return ['Cinder Row', 'The Spire Gardens', 'Neon Bazaar', 'Floodgate District'];
  }
}

async function showLocationChoices() {
  const grid      = document.getElementById('ccLocationGrid');
  const loading   = document.getElementById('ccLocationLoading');
  const errorDiv  = document.getElementById('ccLocationError');
  const descDiv   = document.getElementById('ccLocationDesc');

  if (descDiv) { descDiv.style.display = 'none'; descDiv.innerHTML = ''; }
  loading.style.display = 'block';
  grid.innerHTML        = '';
  errorDiv.textContent  = '';

  try {
    const locations     = await fetchLocationOptions();
    loading.textContent = 'FETCHING LOCATION DATA...';
    const locationData  = [];

    for (const loc of locations) {
      try {
        const descPrompt = `Describe ${loc} as a district within a cyberpunk megacity in one sentence. 
Player name is "${State.playerName}". Let the name's vibe subtly influence the description.
Focus on one distinctive, unusual feature that sets it apart from typical industrial zones. 
Be specific—mention architecture, smell, sound, or a unique landmark. 
Only the description, no extra text.`;
        const raw = await queueRequest(() => callProvider([{ role: 'user', content: descPrompt }], 100));
        locationData.push({ name: loc, description: raw.trim().replace(/^["']|["']$/g, '') });
      } catch (err) {
        locationData.push({ name: loc, description: `The neon-slick streets of ${loc} where survival costs more than credits.` });
      }
    }

    loading.style.display = 'none';
    locationDescriptions  = {};
    locationData.forEach(l => { locationDescriptions[l.name] = l.description; });

    grid.innerHTML = locationData.map(loc => `
      <button class="cc-choice-btn cc-location-btn" data-location="${loc.name}">
        <span class="ccc-name">${loc.name}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.cc-location-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.location;
        grid.querySelectorAll('.cc-location-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (descDiv) {
          descDiv.style.display = 'block';
          descDiv.innerHTML = `
            <div style="margin-top: 12px; padding: 12px; border: 1px solid var(--border); background: var(--bg3);">
              <div style="color: var(--green-dim); margin-bottom: 6px;">${chosen}</div>
              <div style="color: var(--text-dim); font-size: 0.9rem;">${locationDescriptions[chosen]}</div>
              <button id="confirmLocationBtn" class="cc-next-btn" style="margin-top: 12px;">CONTINUE →</button>
            </div>
          `;
          document.getElementById('confirmLocationBtn').addEventListener('click', () => {
            State.origin       = chosen;
            State.locationDesc = locationDescriptions[chosen];
            showClassChoices();
          });
        } else {
          State.origin       = chosen;
          State.locationDesc = locationDescriptions[chosen];
          showClassChoices();
        }
      });
    });
  } catch (err) {
    loading.style.display = 'none';
    errorDiv.textContent  = 'Failed to load locations. Check your AI connection.';
    console.error(err);
  }
}

async function showClassChoices() {
  document.getElementById('ccStepLocation').style.display = 'none';
  document.getElementById('ccStepClass').style.display    = 'flex';
  document.getElementById('ccStepLabel').textContent      = 'STEP 3 / 6';

  const grid        = document.getElementById('ccClassGrid');
  const loading     = document.getElementById('ccClassLoading');
  const descDiv     = document.getElementById('ccClassDesc');
  const errorDiv    = document.getElementById('ccClassError');
  const continueBtn = document.getElementById('ccClassContinueBtn');
  let selectedClass = null;

  loading.style.display     = 'block';
  grid.innerHTML            = '';
  errorDiv.textContent      = '';
  descDiv.style.display     = 'none';
  continueBtn.style.display = 'none';

  try {
    const classes = await Llm.getClasses();
    classData     = {};
    classes.forEach(c => { classData[c.name] = c; });

    loading.style.display = 'none';

    grid.innerHTML = classes.map(c => {
      const stats = c.coreStats || { str: 8, agi: 8, int: 8, cha: 8, tec: 8, end: 8 };
      const hp = c.startHp || 80;
      const cr = c.startCredits || 100;
      const warn = hp < 75 ? 'warn' : '';
      return `<button class="cc-choice-btn cc-class-btn" data-class="${c.name}">
        <span class="ccc-name">// ${c.name.toUpperCase()} //</span>
        <span class="ccc-desc">${c.description}</span>
        <div class="class-stats" style="margin-top: 8px;">
          ${statBar('STR',    stats.str || 0, 'red' )}
          ${statBar('AGI',    stats.agi || 0, 'cyan')}
          ${statBar('INT',    stats.int || 0, ''    )}
          ${statBar('CHA',    stats.cha || 0, 'gold')}
          ${statBar('TEC',    stats.tec || 0, ''    )}
        </div>
        <div class="class-starting">
          <div class="cs-chip ${warn}">HP <span>${hp}</span></div>
          <div class="cs-chip">CR <span>${cr}</span></div>
        </div>
      </button>`;
    }).join('');

    grid.querySelectorAll('.cc-class-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.cc-class-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedClass = btn.dataset.class;

        const cd = classData[selectedClass];
        if (descDiv && cd) {
          descDiv.style.display = 'block';
          descDiv.innerHTML = `
            <div style="padding: 12px; border: 1px solid var(--border); background: var(--bg3);">
              <div style="color: var(--green-dim); margin-bottom: 6px;">${selectedClass}</div>
              <div style="color: var(--text-dim); font-size: 0.85rem;">${cd.description}</div>
              <div style="margin-top: 8px; color: var(--text-lo); font-size: 0.75rem;">Starting HP: ${cd.startHp} | Credits: ${cd.startCredits}</div>
            </div>
          `;
          continueBtn.style.display = 'block';
        }
      });
    });

    continueBtn.onclick = () => {
      if (!selectedClass) { errorDiv.textContent = 'SELECT A CLASS TO CONTINUE'; return; }
      const cd = classData[selectedClass];
      State.playerClass = selectedClass;
      State.classBaseHp = cd.startHp;
      State.classBaseEnergy = cd.startEnergy;
      State.maxHp = StatSystem.calcMaxHp();
      State.hp = State.maxHp;
      State.credits = cd.startCredits;
      State.stats = { ...State.stats, ...cd.coreStats };
      State.maxEnergy = StatSystem.calcMaxEnergy();
      State.energy = State.maxEnergy;
      generateBackstoryAndContinue(State.playerName, State.origin, selectedClass);
    };

  } catch (err) {
    loading.style.display = 'none';
    errorDiv.textContent  = 'Failed to load classes. Check your AI connection.';
    console.error(err);
  }
}

async function generateBackstory(name, origin, locationDesc, playerClass) {
  const prompt = `Generate a gritty cyberpunk backstory for a character named "${name}" who became a ${playerClass}.
  They grew up in ${origin}, a district within a sprawling megacity.

  Location description: ${locationDesc}

  IMPORTANT: Write about how they became a ${playerClass}. Focus on:
  - What skill or talent made them choose this path
  - A specific moment that pushed them toward this profession
  - Who taught them or inspired them
  - What they had to sacrifice

  Write in second person (you). 3-4 sentences. Personal, visceral, specific to this character's experience.

  Also generate 2-3 NPCs from their past (people who shaped them - could be family, friends, rivals, mentors, enemies).
  Respond ONLY with valid JSON, no markdown, no extra text, no trailing commas. Use the exact structure:
  {
    "backstory": "your backstory text",
    "npcs": [
      {"name":"string","relationship":"Friendly|Neutral|Hostile|Suspicious","description":"one sentence — who they are and why they matter"}
    ]
  }`;

  const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 500));
  console.log('[Backstory] Raw AI response:', raw); // Debug log

  // Clean up markdown fences and trailing commas
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Try to parse the JSON
  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (e) {
    console.error('[Backstory] JSON parse failed, attempting fallback extraction:', e);

    // Fallback: extract backstory and npcs using regex
    const backstoryMatch = cleaned.match(/"backstory"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
    const npcsMatch = cleaned.match(/"npcs"\s*:\s*(\[[\s\S]*?\])/);
    
    result = {
      backstory: backstoryMatch ? backstoryMatch[1] : '',
      npcs: []
    };

    if (npcsMatch) {
      try {
        result.npcs = JSON.parse(npcsMatch[1]);
      } catch (e2) {
        console.error('[Backstory] Failed to parse NPCs array:', e2);
      }
    }

    // If still empty, use fallback
    if (!result.backstory) {
      result.backstory = `You grew up hard in ${origin}. The streets didn't care about your name, only what you could do. You learned to fight before you learned to read, and you made enemies you're still running from.`;
    }
  }

  // Ensure NPCs have descriptions
  if (result.npcs && Array.isArray(result.npcs)) {
    result.npcs = result.npcs.map(n => ({
      ...n,
      description: n.description || 'A memory you can\'t shake.',
    }));
  } else {
    result.npcs = [];
  }

  return result;
}

async function generateBackstoryAndContinue(name, origin, playerClass) {
  document.getElementById('ccStepClass').style.display = 'none';
  document.getElementById('ccStep2').style.display     = 'flex';
  document.getElementById('ccStepLabel').textContent   = 'STEP 4 / 6';

  const loadingEl  = document.getElementById('ccBackstoryLoading');
  const textEl     = document.getElementById('ccBackstoryText');
  const tragedySec = document.getElementById('ccTragedySection');

  loadingEl.style.display  = 'block';
  textEl.style.display     = 'none';
  tragedySec.style.display = 'none';
  textEl.textContent       = '';

  try {
    const result    = await generateBackstory(name, origin, State.locationDesc, playerClass);
    State.backstory = result.backstory || '';
    ccBackstoryNpcs = result.npcs      || [];

    loadingEl.style.display = 'none';
    textEl.style.display    = 'block';

    if (!State.backstory) {
      textEl.textContent = `You became a ${playerClass} in ${origin}. The city doesn't care where you're from. You learned to survive. That's all that matters.`;
    } else {
      await typeIntoElement(textEl, State.backstory);
    }
  } catch (e) {
    console.error('Backstory generation failed:', e);
    State.backstory         = `You became a ${playerClass} in ${origin}. The streets made you who you are. You learned to survive when everything wanted you dead.`;
    loadingEl.style.display = 'none';
    textEl.style.display    = 'block';
    textEl.textContent      = State.backstory;
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

  let storyText = tragedy.desc; // fallback
  try {
    // Build NPC list for the prompt
    const npcList = ccBackstoryNpcs.map(n => `- ${n.name} (${n.relationship})`).join('\n');

    const prompt = `Describe the night ${State.playerName} lost everything. The tragedy: ${tragedy.name} — ${tragedy.desc}.
    ${State.playerName} grew up in ${State.origin}. Their backstory: ${State.backstory}.

    Existing NPCs from their past:
    ${npcList || 'No known NPCs yet.'}

    Write a narrative that begins with a specific date and time (e.g., "On the night of February 14, 2076...").
    Use the player's name "${State.playerName}" as a proper name (capitalized and treated as a person's name, not a generic term).
    Tell the event in 3-4 sentences, past tense, second person ("you").
    Focus on what happened: actions, what you saw, what was done.
    Do NOT include reflective language like "still echoes", "haunts me", or "I remember".
    Do NOT reveal who did it – keep the perpetrator a shadow, a figure, a blur.

    Additionally, update the relationships of any NPCs from the list above that are directly involved in this tragedy.
    If an NPC was killed, set relationship to "Dead". If they betrayed the player, set to "Hostile". If they tried to help but failed, set to "Suspicious" (or keep as is). If they are the one who caused the tragedy, keep as "???" for now.

    Return ONLY valid JSON with the following structure:
    {
      "story": "the narrative text",
      "npcUpdates": [
        { "name": "Kaida", "relationship": "Dead", "description": "optional update to description" }
      ]
    }`;

    const raw = await queueRequest(() => callProvider([{ role: 'user', content: prompt }], 350));
    let cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```$/g, '').trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```json\s*/i, '').replace(/```/g, '').trim();
    }

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (e) {
      console.error('Tragedy parse failed:', e);
      result = { story: tragedy.desc, npcUpdates: [] };
    }

    // Use the parsed story
    storyText = result.story || tragedy.desc;

    // Apply NPC updates
    const npcUpdates = result.npcUpdates || [];
    npcUpdates.forEach(update => {
      const existing = ccBackstoryNpcs.find(n => n.name.toLowerCase() === update.name.toLowerCase());
      if (existing) {
        existing.relationship = update.relationship;
        if (update.description) existing.description = update.description;
      } else {
        ccBackstoryNpcs.push({
          name: update.name,
          relationship: update.relationship,
          description: update.description || `Involved in the tragedy.`
        });
      }
    });
  } catch (e) {
    console.error('Tragedy generation failed:', e);
    storyText = tragedy.desc;
  }

  // Display the result
  storyEl.innerHTML = `
    <div class="tragedy-reveal">
      <div class="tragedy-reveal-name">${tragedy.name}</div>
      <div class="tragedy-reveal-text">${storyText}</div>
      <div class="tragedy-reveal-effect">${tragedy.effect}</div>
      <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); color: var(--text-lo); font-size: 11px; letter-spacing: 1px;">❓ SOMEONE TOOK EVERYTHING FROM YOU. YOU WILL FIND OUT WHO.</div>
      <button id="tragedyContinueBtn" class="cc-next-btn" style="margin-top:12px;">CONTINUE →</button>
    </div>`;

  document.getElementById('tragedyContinueBtn').addEventListener('click', () => {
    document.getElementById('ccStep2').style.display = 'none';
    document.getElementById('ccStep3').style.display = 'flex';
    document.getElementById('ccStepLabel').textContent = 'STEP 5 / 6';
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
    b.disabled      = true;
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
  resultEl.textContent   = '';
  resultEl.style.display = 'block';
  await typeIntoElement(resultEl, outcome);

  await new Promise(r => setTimeout(r, 600));
  document.getElementById('ccFinishBtn').style.display = 'block';
}

function animateDiceRoll() {
  return new Promise(resolve => {
    const display   = document.getElementById('ccDiceDisplay');
    const finalRoll = Math.floor(Math.random() * 20) + 1;
    let cycles      = 0;
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
  const btn       = document.getElementById('ccFinishBtn');
  btn.disabled    = true;
  btn.textContent = 'LOADING...';
  try {
    await startGame(State.playerClass);
  } catch (err) {
    console.error(err);
    btn.disabled    = false;
    btn.textContent = 'PROCEED ▶';
  }
}

async function startGameFromMenu() {
  Ui.showScreen('charCreateScreen');
  initCharCreate();
}
