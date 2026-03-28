async function callProvider(messages, maxTokens) {
  maxTokens = maxTokens || MAX_TOKENS;
  let delay = 2000;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (['openai','groq','openrouter'].includes(AI_PROVIDER)) {
        const cfg = AI_PROVIDER === 'groq'       ? GROQ_CONFIG
                  : AI_PROVIDER === 'openrouter' ? OPENROUTER_CONFIG
                  : OPENAI_CONFIG;
        const res = await fetch(cfg.url, {
          method:  'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${cfg.apiKey}` },
          body:    JSON.stringify({ model:cfg.model, messages, max_tokens:maxTokens, temperature:0.8 }),
        });
        if (res.status === 429) {
          const retryAfter = (parseInt(res.headers.get('retry-after')||'0') || Math.ceil(delay/1000)) * 1000;
          await sleep(retryAfter + Math.random() * 600);
          delay = Math.min(delay * 2, 32000);
          continue;
        }
        if (!res.ok) throw new Error(`${AI_PROVIDER} ${res.status}`);
        const data = await res.json();
        return data.choices[0]?.message?.content || '';

        } else if (AI_PROVIDER === 'gemini') {
          const systemMsg    = messages.find(m => m.role === 'system');
          const chatMsgs     = messages.filter(m => m.role !== 'system');
          const geminiContents = chatMsgs.map(m => ({
            role:  m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));
          const body = {
            contents:         geminiContents,
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
          };
          if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type':'application/json' },
            body:    JSON.stringify(body),
          });
          if (res.status === 429) {
            await sleep(delay + Math.random() * 600);
            delay = Math.min(delay * 2, 32000);
            continue;
          }
          if (!res.ok) throw new Error(`Gemini ${res.status}`);
          const data = await res.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (AI_PROVIDER === 'qwen') {
          const res = await fetch(QWEN_CONFIG.url, {
            method:  'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${QWEN_CONFIG.apiKey}`
            },
            body: JSON.stringify({
              model: QWEN_CONFIG.model,
              messages: messages,
              max_tokens: maxTokens,
              temperature: 0.8
            }),
          });
          if (!res.ok) throw new Error(`Qwen ${res.status}`);
          const data = await res.json();
          return data.choices[0]?.message?.content || '';
        } else if (AI_PROVIDER === 'deepseek') {
          const res = await fetch(DEEPSEEK_CONFIG.url, {
            method:  'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
            },
            body: JSON.stringify({
              model: DEEPSEEK_CONFIG.model,
              messages: messages,
              max_tokens: maxTokens,
              temperature: 0.8
            }),
          });
          if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
          const data = await res.json();
          return data.choices[0]?.message?.content || '';
        } else {
        // ollama
        const res = await fetch(OLLAMA_CONFIG.url, {
          method:  'POST',
          headers: { 'Content-Type':'application/json' },
          body:    JSON.stringify({ model:OLLAMA_CONFIG.model, messages, stream:false, options:{ num_predict:maxTokens } }),
        });
        if (!res.ok) throw new Error(`Ollama ${res.status}`);
        const data = await res.json();
        return data.message?.content || '';
      }

    } catch(err) {
      if (attempt >= 3) throw err;
      await sleep(delay + Math.random() * 600);
      delay = Math.min(delay * 2, 32000);
    }
  }
  throw new Error('all retries exhausted');
}

const Llm = {
systemPrompt(extraContext) {
  return `You are the narrator of a gritty cyberpunk text RPG set in a rain-soaked dystopian megacity.
IMPORTANT JSON SYNTAX RULES:
- Do NOT include trailing commas after the last property in an object or array.
- Use double quotes for all property names and string values.
- Ensure the JSON is valid.

THE MOST IMPORTANT RULES THAT YOU MUST NOT BREAK:
- Do not just accept any player dialogue, you must always determine if it is possible within the current state and rules.
- If it is not possible, write the response in a way where the player does not gain their intended move, and fails it.
- You are going AGAINST the player, not WITH the player, do NOT baby the player, do NOT allow them to control and write reality, ONLY YOU will allow certain actions.
- Do NOT whatsoever assume the next action of the player; do NOT make actions for the player.

CRITICAL RULES:
0. **COMBAT TRIGGER** – Include the "combat" field when ANY of these are true: the player explicitly attempts physical violence ("I punch", "I attack", "I shoot", "I stab"); an NPC attacks or lunges at the player; the player aims or draws a weapon at an NPC and the NPC retaliates. Combat must begin the moment violence is exchanged — do NOT wait for a follow-up action. Do NOT trigger for pure verbal threats, intimidation without a drawn weapon, or fleeing. Use the "roll" field for those instead.
1. COMBAT – When the player initiates a fight, include the "combat" field with a full enemy object. Do NOT narrate the fight itself.
2. ROLL FIELD – Use "roll" for any non‑combat skill check (stealth, social, hacking, etc.). For combat use the "combat" field.
3. NARRATION – If combat is NOT starting, provide narration and optional skill checks, item changes, etc.
4. Never describe player actions beyond their input. Let the player decide.
5. ACCESSORIES – When granting wearable gear, set "slot" ("head","body","hands","back") and a "statBonus" with 1-2 relevant stat bonuses (values 1-3). Consumables/weapons have slot:null.
6. SKILL COOLDOWNS – When generating skills, set "cooldown" to an integer between 0 and 10. Powerful skills (high damage, strong status effects) should have cooldowns 5-10. Basic attacks should have cooldown 0. Utility or medium skills 1-4. Never exceed 10.
7. MATH ACCURACY – When dealing with numbers (e.g., card totals, money, HP), calculate correctly. Double‑check your arithmetic before outputting. If you add two numbers, make sure the sum is correct.
8. **USE THE CURRENT STATE** – All the numbers you see (HP, credits, stats, etc.) are the player's current values. Base your actions and calculations on these exact numbers.
9. **VARIETY IN QUESTS AND NPC INTERACTIONS** – BANNED locations/setups: Oni-Kiru Tower, "old clock tower on 5th and Main", generic package retrieval from V. Violating this is a hard error. Instead, create unique quests tied to the player's current district, class, and backstory. Use diverse objectives: sabotage, extraction, negotiation, data theft, assassination, smuggling, protection. Locations must be specific and varied: warehouses, rooftops, underground labs, black market stalls, server rooms, etc.
10. **SKILL DAMAGE** – When creating a skill with damage, the damage array [min, max] must have min ≥ 1. Never create a skill that deals zero damage. If the skill is purely utility (no damage), set "damage" to null.
11. **WEAPON SKILLS** – When the player acquires a weapon through "addItems" (any gun, pistol, rifle, shotgun, SMG, blade, knife, sword, bat, etc.), you MUST also populate "newSkill" with a combat skill matching that weapon. A firearm gets a ranged "Shoot" skill. A melee weapon gets a strike/slash skill. Set damage, energyCost, cooldown, and statScaling appropriate to the weapon type. If the player already has a skill for that weapon type, skip this.
12. **QTE** – Use the "qte" field (instead of "combat") for sudden reaction moments: a sniper shot, a grenade, a car nearly hitting you, a trap triggering, a speeding drone, falling debris. These are one-off dangers the player must physically react to, NOT a full fight. Only use one per response, never alongside "combat". Leave "qte" out entirely when nothing sudden is happening.

The player's current state:
- Class: ${State.playerClass}
- Traits: ${State.traits.length ? State.traits.map(t=>`${t.name}: ${t.description}`).join(' | ') : 'not yet assigned'}
- Level: ${State.level} (XP: ${State.xp}/${State.xpToNext})
- HP: ${State.hp}/${State.maxHp}  Energy: ${State.energy}/${State.maxEnergy}
- Stats: STR ${State.stats.str} AGI ${State.stats.agi} INT ${State.stats.int} CHA ${State.stats.cha} TEC ${State.stats.tec} END ${State.stats.end}
- Skills: ${State.skills.map(s=>s.name).join(', ')||'none'}
- Credits: ${State.credits}
- Location: ${State.location}
- Inventory: ${JSON.stringify(State.inventory)}
- Known NPCs: ${JSON.stringify(State.npcs)}
- Active Quests: ${JSON.stringify(State.quests)}
${extraContext || ''}

You MUST respond ONLY with a single valid JSON object. No prose outside the JSON. No markdown fences.
Schema:
{
  "narration": "string — immersive second-person narration, 2-3 sentences MAX. Must be a complete, finished sentence. Never end mid-word or mid-thought. NPC dialogue must be kept to one short line if included.",
  "addItems":    [{ "name":"string","amount":number,"description":"string","slot":"head|body|hands|back|null","statBonus":{"str":0,"agi":0,"int":0,"cha":0,"tec":0,"end":0} }],
  "removeItems": [{ "name":"string","amount":number }],
  "npcs":        [{ "name":"string","relationship":"Friendly|Neutral|Hostile|Suspicious|Ally" }],
  "quests":      [{ "title":"string","description":"string","status":"active|complete|failed" }],
  "traits":      ["NAME||description"]  — array, usually 1 entry. On rare occasions (10% chance) include 2 entries for a dual-trait character.
  "newSkill":    { "name":"string","description":"string","damage":[min,max]|null,"energyCost":number,"cooldown":number,"statScaling":"str|agi|int|cha|tec|null","statusEffect":null|{"name":"string","type":"string","duration":number,"value":number} },
  "hpDelta":     number,
  "creditsDelta":number,
  "newLocation": "string",
  "timeAdvance": number (minutes, 0-1440),
  "roll":        "none|stealth|combat|social|hacking",
    "qte": {
    "prompt": "string — tense one-sentence description of what the player must react to",
    "action": "string — 1-2 word button label e.g. DODGE, HACK, GRAB, JUMP",
    "timeLimit": number (seconds, between 3 and 6),
    "successNarration": "string — what happens if they react in time",
    "failNarration": "string — what happens if they fail",
    "successHpDelta": number,
    "failHpDelta": number (usually negative, e.g. -15)
  },
  "combat": {
    "enemy": {
      "name":"string","level":number,"hp":number,"description":"string",
      "skills":[{"name":"string","damage":[min,max],"energyCost":number,"cooldown":number,"statusEffect":null}]
    }
  }
}`;
},

  async send(userMessage, extraContext, maxTokensOverride) {
    window.__lastUserMessage   = userMessage;
    window.__lastExtraContext  = extraContext;

    State.history.push({ role:'user', content:userMessage });

    const messages = [
      { role:'system', content: this.systemPrompt(extraContext) },
      ...State.history.slice(-12),
    ];

    const result = await queueRequest(async () => {
      const raw = await callProvider(messages, maxTokensOverride || MAX_TOKENS);
      State.history.push({ role:'assistant', content:raw });
      return this.parse(raw);
    });

    return result;
  },

 parse(raw) {
    let cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1'); // remove trailing commas

    // Attempt to fix common malformed JSON: unescaped quotes, etc.
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn('JSON parse error:', e.message);
      // Try to extract narration if possible
      const fallback = {};

      // Try to capture narration field (can handle unclosed strings)
      let narMatch = raw.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)/);
      if (narMatch) {
        let narration = narMatch[1];
        // Remove any trailing incomplete characters if the string wasn't closed
        narration = narration.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '');
        fallback.narration = narration + (narMatch[0].endsWith('"') ? '' : '…');
      } else {
        fallback.narration = raw.slice(0, 200) || 'The silence stretches.';
      }

      // Try to capture combat if present
      const combatMatch = raw.match(/"combat"\s*:\s*(\{(?:[^{}]|(?:\{[^{}]*\}))*\})/);
      if (combatMatch) {
        try {
          let cs = combatMatch[1].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          fallback.combat = JSON.parse(cs);
        } catch(ce) {}
      }

      // Try to capture npcs
      const npcsMatch = raw.match(/"npcs"\s*:\s*(\[[^\]]*\])/);
      if (npcsMatch) {
        try { fallback.npcs = JSON.parse(npcsMatch[1].replace(/,\s*]/g, ']')); } catch(_) {}
      }

      // Try to capture numeric deltas
      const hpD = raw.match(/"hpDelta"\s*:\s*(-?\d+)/);
      if (hpD) fallback.hpDelta = parseInt(hpD[1]);
      const crD = raw.match(/"creditsDelta"\s*:\s*(-?\d+)/);
      if (crD) fallback.creditsDelta = parseInt(crD[1]);
      const newL = raw.match(/"newLocation"\s*:\s*"([^"]*)"/);
      if (newL) fallback.newLocation = newL[1];
      const roll = raw.match(/"roll"\s*:\s*"([^"]*)"/);
      if (roll) fallback.roll = roll[1];

      return fallback;
    }
  },

  async getClasses() {
    const prompt = `Generate exactly 4 cyberpunk character classes for a noir RPG. Respond ONLY with valid JSON — no markdown, no commentary.
Format:
[
  {
    "name": "CLASS NAME",
    "description": "One evocative sentence describing the class specialty and style.",
    "startHp": number between 60-100,
    "startCredits": number between 0-200,
    "stats": { "combat":number,"hacking":number,"stealth":number,"social":number,"tech":number }
  }
]
Rules: stats must add up to exactly 25 total across all 5. Make them distinct: one hacker, one street combat, one social/manipulation, one hybrid. Names 1-2 words max.`;

    const fallback = [
      { name:'Netrunner',   description:'Ghost in the wire — hacks systems and rewrites reality through cyberspace.', startHp:70,  startCredits:150, stats:{combat:2,hacking:9,stealth:5,social:4,tech:5} },
      { name:'Street Merc', description:'Augmented muscle for hire, equal parts chrome and brutality.',               startHp:100, startCredits:50,  stats:{combat:9,hacking:1,stealth:4,social:3,tech:8} },
      { name:'Fixer',       description:'Knows everyone, owes no one — deals in favors, secrets, and survival.',      startHp:80,  startCredits:200, stats:{combat:3,hacking:4,stealth:5,social:9,tech:4} },
      { name:'Splice',      description:'Bio-modded anomaly walking the line between human and something worse.',      startHp:85,  startCredits:80,  stats:{combat:5,hacking:4,stealth:7,social:3,tech:6} },
    ];

    return queueRequest(async () => {
      let raw = '';
      try { raw = await callProvider([{ role:'user', content:prompt }], 800); }
      catch(err) { console.warn('class gen failed:', err); return fallback; }

      if (!raw) return fallback;
      try {
        const clean   = raw.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
        let classes   = JSON.parse(clean);
        const defSt   = { combat:5, hacking:5, stealth:5, social:5, tech:5 };
        classes = classes.map(c => ({
          name:         c.name         || 'Unknown',
          description:  c.description  || '',
          startHp:      c.startHp      || 80,
          startCredits: c.startCredits || 100,
          stats: {
            combat:  c.stats?.combat  ?? defSt.combat,
            hacking: c.stats?.hacking ?? defSt.hacking,
            stealth: c.stats?.stealth ?? defSt.stealth,
            social:  c.stats?.social  ?? defSt.social,
            tech:    c.stats?.tech    ?? defSt.tech,
          },
        }));
        return classes;
      } catch(e) { console.error('class JSON parse failed:', e); return fallback; }
    });
  },
};
