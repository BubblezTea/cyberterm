const _savedCfg = JSON.parse(localStorage.getItem('ct_ai_config') || '{}');

let AI_PROVIDER = _savedCfg.provider || 'ollama';
let COMBAT_NARRATION_ENABLED = false;

const OPENAI_CONFIG = {
  apiKey: _savedCfg.openaiKey   || '',
  model:  _savedCfg.openaiModel || 'gpt-4o-mini',
  url:    'https://api.openai.com/v1/chat/completions',
};

const OLLAMA_CONFIG = {
  url:   _savedCfg.ollamaUrl   || 'http://localhost:11434/api/chat',
  model: _savedCfg.ollamaModel || 'gemma3:4b',
};

const OPENROUTER_CONFIG = {
  apiKey: _savedCfg.openrouterKey   || '',
  model:  _savedCfg.openrouterModel || 'nvidia/nemotron-3-super-120b-a12b:free',
  url:    'https://openrouter.ai/api/v1/chat/completions',
};

const GROQ_CONFIG = {
  apiKey: _savedCfg.groqKey   || '',
  model:  _savedCfg.groqModel || 'llama-3.3-70b-versatile',
  url:    'https://api.groq.com/openai/v1/chat/completions',
};

const GEMINI_CONFIG = {
  apiKey: _savedCfg.geminiKey   || '',
  model:  _savedCfg.geminiModel || 'gemini-2.0-flash',
};

const QWEN_CONFIG = {
  apiKey: _savedCfg.qwenKey   || '',
  model:  _savedCfg.qwenModel || 'qwen-plus',
  url:    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
};

const DEEPSEEK_CONFIG = {
  apiKey: _savedCfg.deepseekKey   || '',
  model:  _savedCfg.deepseekModel || 'deepseek-chat',
  url:    'https://api.deepseek.com/v1/chat/completions',
};

const HUGGINGFACE_CONFIG = {
  apiKey: _savedCfg.hfKey   || '',
  model:  _savedCfg.hfModel || 'mistralai/Mistral-7B-Instruct-v0.3',
  url:    'https://api-inference.huggingface.co/v1/chat/completions',
};

function saveAiConfig() {
  localStorage.setItem('ct_ai_config', JSON.stringify({
    provider:       AI_PROVIDER,
    openaiKey:      OPENAI_CONFIG.apiKey,
    openaiModel:    OPENAI_CONFIG.model,
    ollamaUrl:      OLLAMA_CONFIG.url,
    ollamaModel:    OLLAMA_CONFIG.model,
    groqKey:        GROQ_CONFIG.apiKey,
    groqModel:      GROQ_CONFIG.model,
    openrouterKey:  OPENROUTER_CONFIG.apiKey,
    openrouterModel:OPENROUTER_CONFIG.model,
    geminiKey:      GEMINI_CONFIG.apiKey,
    geminiModel:    GEMINI_CONFIG.model,
    qwenKey:        QWEN_CONFIG.apiKey,
    qwenModel:      QWEN_CONFIG.model,
    deepseekKey:    DEEPSEEK_CONFIG.apiKey,
    deepseekModel:  DEEPSEEK_CONFIG.model,
    hfKey:          HUGGINGFACE_CONFIG.apiKey,
    hfModel:        HUGGINGFACE_CONFIG.model,
  }));
}

const MAX_TOKENS = 5000;

// ─── request queue ─────────────────────────────────────
let lastRequestTime = 0;
let queueLocked     = false;
const queuePending  = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function providerInterval() {
  if (AI_PROVIDER === 'groq')   return 3500;
  if (AI_PROVIDER === 'openai') return 2500;
  return 0;
}

function queueRequest(fn) {
  return new Promise((resolve, reject) => {
    queuePending.push({ fn, resolve, reject });
    if (!queueLocked) drainQueue();
  });
}

async function drainQueue() {
  if (!queuePending.length) { queueLocked = false; return; }
  queueLocked = true;
  const { fn, resolve, reject } = queuePending.shift();
  const gap  = providerInterval();
  const wait = Math.max(0, gap - (Date.now() - lastRequestTime));
  if (wait > 0) await sleep(wait);
  lastRequestTime = Date.now();
  try { resolve(await fn()); } catch(e) { reject(e); }
  drainQueue();
}
