const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const ELEVENLABS_KEY_PATH = path.join(__dirname, 'secrets', 'elevenlabs.key');
const ELEVENLABS_VOICE_PATH = path.join(__dirname, 'secrets', 'elevenlabs.voice');
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';

function loadElevenLabsKey() {
  try {
    return fs.readFileSync(ELEVENLABS_KEY_PATH, 'utf8').trim();
  } catch (err) {
    return process.env.ELEVENLABS_API_KEY || '';
  }
}

function loadElevenLabsVoicePreference() {
  try {
    return fs.readFileSync(ELEVENLABS_VOICE_PATH, 'utf8').trim();
  } catch (err) {
    return process.env.ELEVENLABS_VOICE_NAME || '';
  }
}

function looksLikeVoiceId(value) {
  return /^[a-zA-Z0-9_-]{20,}$/.test(value);
}

async function resolveElevenLabsVoiceId(apiKey) {
  const preference = loadElevenLabsVoicePreference();
  if (!preference) {
    return ELEVENLABS_VOICE_ID;
  }
  if (looksLikeVoiceId(preference)) {
    return preference;
  }

  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey }
  });

  if (!voicesRes.ok) {
    const errorText = await voicesRes.text();
    let message = 'ElevenLabs voices lookup failed';
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail?.message || errorJson.message || message;
    } catch (err) {
      if (errorText) {
        message = errorText;
      }
    }
    throw new Error(message);
  }

  const data = await voicesRes.json();
  const voices = data?.voices || [];
  const match = voices.find((voice) => voice.name?.toLowerCase() === preference.toLowerCase());
  if (!match) {
    throw new Error(`Voice not found: ${preference}`);
  }
  return match.voice_id;
}

const ELEVENLABS_API_KEY = loadElevenLabsKey();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const scenariosPath = path.join(__dirname, 'data', 'scenarios.json');
const instructionsPath = path.join(__dirname, 'data', 'prompt_instructions.txt');

function loadScenarios() {
  const raw = fs.readFileSync(scenariosPath, 'utf8');
  return JSON.parse(raw);
}

function loadInstructions() {
  try {
    return fs.readFileSync(instructionsPath, 'utf8').trim();
  } catch (err) {
    return '';
  }
}

function buildPrompt(scenario, userResponse) {
  const addresses = scenario.televised_addresses || {};
  const actorBlocks = Object.entries(addresses).map(([key, text]) => {
    const name = key.replace(/_/g, ' ');
    return `${name} (televised_address): ${text}`;
  }).join('\n');

  const instructions = loadInstructions();
  const includeCambodia = Boolean(scenario.televised_addresses?.Cambodia);

  return `You are an AI reviewer.
Task: provide feedback on the user's response from four perspectives.

Instructions:
${instructions || 'Use the scenario context and the user response.'}

Scenario:
Title: ${scenario.title}
Text: ${scenario.scenario_text}

Key actors and positions:
${actorBlocks}

User response:
${userResponse}

Return feedback in labeled blocks, with each label on its own line:
us_feedback:
china_feedback:
singapore_feedback:
${includeCambodia ? 'cambodia_feedback:' : 'cambodia_feedback: N/A'}

Each block should be 2-4 sentences. Keep the tone analytical and neutral.`;
}

function parseLabeledBlocks(text) {
  const labels = ['us_feedback', 'china_feedback', 'singapore_feedback', 'cambodia_feedback'];
  const blocks = Object.fromEntries(labels.map((label) => [label, '']));
  let current = null;

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const labelMatch = labels.find((label) => trimmed.startsWith(`${label}:`));
    if (labelMatch) {
      current = labelMatch;
      blocks[current] = trimmed.slice(labelMatch.length + 1).trim();
      return;
    }

    if (current) {
      blocks[current] = `${blocks[current]}\n${line}`.trim();
    }
  });

  return {
    us: blocks.us_feedback.trim(),
    china: blocks.china_feedback.trim(),
    singapore: blocks.singapore_feedback.trim(),
    cambodia: blocks.cambodia_feedback.trim()
  };
}

app.get('/api/scenarios', (req, res) => {
  res.json(loadScenarios());
});

app.get('/api/models', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;

  try {
    const apiRes = await fetch(endpoint);
    const data = await apiRes.json();

    if (!apiRes.ok) {
      return res.status(502).json({ error: data.error?.message || 'Gemini API error' });
    }

    const models = (data.models || []).map((model) => ({
      name: model.name,
      displayName: model.displayName,
      supportedGenerationMethods: model.supportedGenerationMethods || []
    }));

    return res.json({ models });
  } catch (err) {
    return res.status(500).json({ error: 'Request failed' });
  }
});

app.post('/api/tts', async (req, res) => {
  const { text } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });
  }

  let voiceId = ELEVENLABS_VOICE_ID;
  try {
    voiceId = await resolveElevenLabsVoiceId(ELEVENLABS_API_KEY);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid voice setting' });
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      let message = 'ElevenLabs API error';
      try {
        const errorJson = JSON.parse(errorText);
        message = errorJson.detail?.message || errorJson.message || message;
      } catch (err) {
        if (errorText) {
          message = errorText;
        }
      }
      return res.status(502).json({ error: message });
    }

    const audioBuffer = Buffer.from(await apiRes.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(audioBuffer);
  } catch (err) {
    return res.status(500).json({ error: 'Request failed' });
  }
});

app.post('/api/generate', async (req, res) => {
  const { scenarioId, userResponse } = req.body || {};

  if (!scenarioId || !userResponse) {
    return res.status(400).json({ error: 'scenarioId and userResponse are required' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  const scenarios = loadScenarios();
  const scenario = scenarios.find((item) => item.id === String(scenarioId));

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  const prompt = buildPrompt(scenario, userResponse);
  const modelName = GEMINI_MODEL.startsWith('models/')
    ? GEMINI_MODEL
    : `models/${GEMINI_MODEL}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512
        }
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      return res.status(502).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text).join('').trim();

    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    const blocks = parseLabeledBlocks(text);
    return res.json({ text, blocks });
  } catch (err) {
    return res.status(500).json({ error: 'Request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


