const scenarioSelect = document.getElementById('scenarioSelect');
const scenarioTitle = document.getElementById('scenarioTitle');
const infoBtn = document.getElementById('infoBtn');
const resetBtn = document.getElementById('resetBtn');
const usBtn = document.getElementById('usBtn');
const chinaBtn = document.getElementById('chinaBtn');
const cambodiaBtn = document.getElementById('cambodiaBtn');
const singaporeBtn = document.getElementById('singaporeBtn');
const respondBtn = document.getElementById('respondBtn');

const infoPopup = document.getElementById('popup-info');
const respondPopup = document.getElementById('popup-respond');
const feedbackPopup = document.getElementById('popup-feedback');
const usPopup = document.getElementById('popup-us');
const chinaPopup = document.getElementById('popup-china');
const cambodiaPopup = document.getElementById('popup-cambodia');
const singaporePopup = document.getElementById('popup-singapore');

const infoTitle = document.getElementById('infoTitle');
const infoText = document.getElementById('infoText');
const respondTitle = document.getElementById('respondTitle');
const status = document.getElementById('status');
const soundOnBtn = document.getElementById('soundOnBtn');
const soundOffBtn = document.getElementById('soundOffBtn');
const respondMindefBtn = document.getElementById('respondMindefBtn');
const respondMtiBtn = document.getElementById('respondMtiBtn');
const respondMhaBtn = document.getElementById('respondMhaBtn');

const API_BASE = window.location.origin;
const apiUrl = (path) => `${API_BASE}${path}`;

const feedbackTitle = document.getElementById('feedbackTitle');
const feedbackUsBtn = document.getElementById('feedbackUsBtn');
const feedbackChinaBtn = document.getElementById('feedbackChinaBtn');
const feedbackSingaporeBtn = document.getElementById('feedbackSingaporeBtn');
const feedbackCambodiaBtn = document.getElementById('feedbackCambodiaBtn');
const feedbackUs = document.getElementById('feedbackUs');
const feedbackChina = document.getElementById('feedbackChina');
const feedbackSingapore = document.getElementById('feedbackSingapore');
const feedbackCambodia = document.getElementById('feedbackCambodia');

const usLeaderText = document.getElementById('usLeaderText');
const chinaLeaderText = document.getElementById('chinaLeaderText');
const cambodiaLeaderText = document.getElementById('cambodiaLeaderText');
const singaporeSectionText = document.getElementById('singaporeSectionText');
const singaporeFace1Btn = document.getElementById('singaporeFace1Btn');
const singaporeFace2Btn = document.getElementById('singaporeFace2Btn');
const singaporeFace3Btn = document.getElementById('singaporeFace3Btn');
const usBodyImg = document.getElementById('usBodyImg');
const chinaBodyImg = document.getElementById('chinaBodyImg');
const cambodiaBodyImg = document.getElementById('cambodiaBodyImg');

let scenarios = [];
let activeScenario = null;
let feedbackBlocks = null;
let ttsAudio = null;
let ttsAudioUrl = '';
let ttsController = null;
let ttsStopped = false;
let ttsNextAudio = null;
let ttsNextUrl = '';

if (soundOnBtn && soundOffBtn) {
  soundOnBtn.disabled = true;
  soundOffBtn.disabled = true;
}

function openPopup(popup) {
  popup.classList.add('open');
  popup.setAttribute('aria-hidden', 'false');
  toggleMapButtons(false);
  if (popup === usPopup && usBodyImg) {
    usBodyImg.classList.add('visible');
  }
  if (popup === chinaPopup && chinaBodyImg) {
    chinaBodyImg.classList.add('visible');
  }
  if (popup === cambodiaPopup && cambodiaBodyImg) {
    cambodiaBodyImg.classList.add('visible');
  }
  if (popup === infoPopup && activeScenario) {
    startTts(activeScenario.scenario_text);
  }
}

function closePopup(popup) {
  popup.classList.remove('open');
  popup.setAttribute('aria-hidden', 'true');
  if (popup === usPopup && usBodyImg) {
    usBodyImg.classList.remove('visible');
  }
  if (popup === chinaPopup && chinaBodyImg) {
    chinaBodyImg.classList.remove('visible');
  }
  if (popup === cambodiaPopup && cambodiaBodyImg) {
    cambodiaBodyImg.classList.remove('visible');
  }
  if (!document.querySelector('.popup.open')) {
    toggleMapButtons(Boolean(activeScenario));
  }
}

function closeAllPopups() {
  [
    infoPopup,
    respondPopup,
    feedbackPopup,
    usPopup,
    chinaPopup,
    cambodiaPopup,
    singaporePopup
  ].forEach(closePopup);
}

function toggleMapButtons(visible) {
  const mapButtons = [usBtn, chinaBtn, cambodiaBtn, singaporeBtn, respondBtn];
  mapButtons.forEach((btn) => {
    if (!btn) return;
    if (!visible) {
      btn.classList.add('hidden');
      return;
    }
    if (btn === cambodiaBtn && cambodiaBtn.dataset.available === 'false') {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
  });
}

function setCambodiaVisibility(show) {
  if (!cambodiaBtn) return;
  cambodiaBtn.dataset.available = show ? 'true' : 'false';
  cambodiaBtn.classList.toggle('hidden', !show);
}

function setCabinetPanel({ minister, recommendation, reasoning }) {
  if (!singaporeSectionText) return;
  singaporeSectionText.textContent = '';
  singaporeSectionText.classList.remove('active');

  const name = document.createElement('div');
  name.className = 'cabinet-panel-minister';
  name.textContent = minister;

  const rec = document.createElement('div');
  rec.className = 'cabinet-panel-rec';
  rec.textContent = `Recommendation: ${recommendation}`;

  const reason = document.createElement('div');
  reason.className = 'cabinet-panel-reason';
  reason.textContent = reasoning;

  singaporeSectionText.appendChild(name);
  singaporeSectionText.appendChild(rec);
  singaporeSectionText.appendChild(reason);
  singaporeSectionText.classList.add('active');
}

function setSoundButtons(isPlaying) {
  if (!soundOnBtn || !soundOffBtn) return;
  soundOnBtn.hidden = isPlaying;
  soundOffBtn.hidden = !isPlaying;
}

function stopTts({ resetButtons = true } = {}) {
  ttsStopped = true;
  if (ttsController) {
    ttsController.abort();
    ttsController = null;
  }
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  if (ttsNextAudio) {
    ttsNextAudio.pause();
    ttsNextAudio.src = '';
    ttsNextAudio = null;
  }
  if (ttsAudioUrl) {
    URL.revokeObjectURL(ttsAudioUrl);
    ttsAudioUrl = '';
  }
  if (ttsNextUrl) {
    URL.revokeObjectURL(ttsNextUrl);
    ttsNextUrl = '';
  }
  if (resetButtons) {
    setSoundButtons(false);
  }
}

function splitIntoSentences(text) {
  return (text || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

async function fetchTtsAudio(sentence, controller) {
  const res = await fetch(apiUrl('/api/tts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sentence }),
    signal: controller.signal
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'TTS request failed.');
  }

  const audioBlob = await res.blob();
  const url = URL.createObjectURL(audioBlob);
  const audio = new Audio(url);
  return { audio, url };
}

async function playSentenceQueue(sentences) {
  for (let i = 0; i < sentences.length; i += 1) {
    if (ttsStopped) return;
    const controller = new AbortController();
    ttsController = controller;

    try {
      const currentSentence = sentences[i];
      if (!ttsAudio) {
        const current = await fetchTtsAudio(currentSentence, controller);
        ttsAudio = current.audio;
        ttsAudioUrl = current.url;
      }

      const nextSentence = sentences[i + 1];
      if (nextSentence && !ttsNextAudio) {
        fetchTtsAudio(nextSentence, controller)
          .then((next) => {
            if (ttsStopped) {
              next.audio.pause();
              URL.revokeObjectURL(next.url);
              return;
            }
            ttsNextAudio = next.audio;
            ttsNextUrl = next.url;
          })
          .catch(() => {});
      }

      await ttsAudio.play();
      await new Promise((resolve) => {
        ttsAudio.addEventListener('ended', resolve, { once: true });
      });

      if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
      }
      ttsAudio = null;
      ttsAudioUrl = '';

      if (ttsNextAudio) {
        ttsAudio = ttsNextAudio;
        ttsAudioUrl = ttsNextUrl;
        ttsNextAudio = null;
        ttsNextUrl = '';
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        stopTts();
      }
      return;
    } finally {
      ttsController = null;
    }
  }

  stopTts();
}

async function startTts(text) {
  const sentences = splitIntoSentences(text);
  if (!sentences.length) return;
  stopTts({ resetButtons: false });
  ttsStopped = false;
  setSoundButtons(true);
  await playSentenceQueue(sentences);
}

function resetProgress(keepScenario = true) {
  stopTts();
  status.textContent = '';
  feedbackBlocks = null;
  setFeedbackPanels(null);
  setActiveFeedback(null);
  closeAllPopups();

  if (!keepScenario) {
    scenarioSelect.selectedIndex = 0;
    scenarioTitle.textContent = 'Select a scenario';
    activeScenario = null;
    if (soundOnBtn && soundOffBtn) {
      soundOnBtn.disabled = true;
      soundOffBtn.disabled = true;
      setSoundButtons(false);
    }
  }
}

function setActiveFeedback(target) {
  [feedbackUs, feedbackChina, feedbackSingapore, feedbackCambodia].forEach((panel) => {
    panel.classList.remove('active');
  });
  if (target) {
    target.classList.add('active');
  }
}

function updateLeaderText(actorKey, element) {
  if (!activeScenario) {
    element.textContent = 'Select a scenario first.';
    return;
  }
  const keyMap = {
    US: 'US',
    China: 'China',
    Cambodia: 'Cambodia'
  };
  const lookupKey = keyMap[actorKey] || actorKey;
  const address = activeScenario.televised_addresses?.[lookupKey] || '';
  element.textContent = address || 'No address available.';
}

function applyScenario(scenario) {
  activeScenario = scenario;
  scenarioTitle.textContent = scenario.title;
  infoTitle.textContent = scenario.title;
  infoText.textContent = scenario.scenario_text;
  respondTitle.textContent = 'Select a cabinet recommendation to proceed.';
  feedbackTitle.textContent = scenario.title;
  resetProgress(true);

  const showCambodia = Boolean(scenario.televised_addresses?.Cambodia);
  setCambodiaVisibility(showCambodia);
  feedbackCambodiaBtn.style.display = showCambodia ? 'block' : 'none';

  updateLeaderText('US', usLeaderText);
  updateLeaderText('China', chinaLeaderText);
  updateLeaderText('Cambodia', cambodiaLeaderText);
  if (singaporeSectionText) {
    singaporeSectionText.textContent = '';
  }
  toggleMapButtons(true);
  if (soundOnBtn && soundOffBtn) {
    soundOnBtn.disabled = false;
    soundOffBtn.disabled = false;
  }

  const mindef = scenario.cabinet_recommendations?.MINDEF;
  const mti = scenario.cabinet_recommendations?.MTI;
  const mha = scenario.cabinet_recommendations?.MHA;
  if (respondMindefBtn) {
    respondMindefBtn.textContent = mindef?.recommendation || 'MINDEF recommendation unavailable.';
  }
  if (respondMtiBtn) {
    respondMtiBtn.textContent = mti?.recommendation || 'MTI recommendation unavailable.';
  }
  if (respondMhaBtn) {
    respondMhaBtn.textContent = mha?.recommendation || 'MHA recommendation unavailable.';
  }

  openPopup(infoPopup);
}

function renderScenarioOptions() {
  scenarioSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose scenario';
  scenarioSelect.appendChild(placeholder);

  scenarios.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.title;
    scenarioSelect.appendChild(option);
  });
}

function setFeedbackPanels(blocks) {
  const panels = [
    { root: feedbackUs, text: blocks?.us },
    { root: feedbackChina, text: blocks?.china },
    { root: feedbackSingapore, text: blocks?.singapore },
    { root: feedbackCambodia, text: blocks?.cambodia }
  ];

  panels.forEach(({ root, text }) => {
    if (!root) return;
    const body = root.querySelector('.feedback-text');
    if (!body) return;
    body.textContent = text || 'No feedback yet.';
  });
}

function showFeedback(type) {
  if (!feedbackBlocks) {
    setFeedbackPanels(null);
  }

  if (type === 'us') {
    setActiveFeedback(feedbackUs);
  } else if (type === 'china') {
    setActiveFeedback(feedbackChina);
  } else if (type === 'singapore') {
    setActiveFeedback(feedbackSingapore);
  } else if (type === 'cambodia') {
    setActiveFeedback(feedbackCambodia);
  }
}

async function loadScenarios() {
  const res = await fetch(apiUrl('/api/scenarios'));
  scenarios = await res.json();
  renderScenarioOptions();
  setCambodiaVisibility(false);
  feedbackCambodiaBtn.style.display = 'none';
  toggleMapButtons(false);
}

scenarioSelect.addEventListener('change', (event) => {
  const selected = scenarios.find((scenario) => scenario.id === event.target.value);
  if (selected) {
    applyScenario(selected);
  }
});

infoBtn.addEventListener('click', () => {
  if (!activeScenario) return;
  openPopup(infoPopup);
});

respondBtn.addEventListener('click', () => {
  if (!activeScenario) return;
  openPopup(respondPopup);
});

usBtn.addEventListener('click', () => {
  if (!activeScenario) return;
  updateLeaderText('US', usLeaderText);
  openPopup(usPopup);
});

chinaBtn.addEventListener('click', () => {
  if (!activeScenario) return;
  updateLeaderText('China', chinaLeaderText);
  openPopup(chinaPopup);
});

cambodiaBtn.addEventListener('click', () => {
  if (!activeScenario) return;
  updateLeaderText('Cambodia', cambodiaLeaderText);
  openPopup(cambodiaPopup);
});

if (singaporeBtn) {
  singaporeBtn.addEventListener('click', () => {
    openPopup(singaporePopup);
    if (singaporeSectionText) {
      singaporeSectionText.textContent = '';
      singaporeSectionText.classList.remove('active');
    }
  });
}

if (singaporeFace1Btn) {
  singaporeFace1Btn.addEventListener('click', () => {
    if (!activeScenario) return;
    const mindef = activeScenario.cabinet_recommendations?.MINDEF;
    setCabinetPanel({
      minister: mindef?.minister || 'Minister for Defence',
      recommendation: mindef?.recommendation || '',
      reasoning: mindef?.reasoning || ''
    });
  });
}

if (singaporeFace2Btn) {
  singaporeFace2Btn.addEventListener('click', () => {
    if (!activeScenario) return;
    const mti = activeScenario.cabinet_recommendations?.MTI;
    setCabinetPanel({
      minister: mti?.minister || 'Minister for Trade and Industry',
      recommendation: mti?.recommendation || '',
      reasoning: mti?.reasoning || ''
    });
  });
}

if (singaporeFace3Btn) {
  singaporeFace3Btn.addEventListener('click', () => {
    if (!activeScenario) return;
    const mha = activeScenario.cabinet_recommendations?.MHA;
    setCabinetPanel({
      minister: mha?.minister || 'Minister for Home Affairs',
      recommendation: mha?.recommendation || '',
      reasoning: mha?.reasoning || ''
    });
  });
}

resetBtn.addEventListener('click', () => {
  resetProgress(true);
});

if (soundOnBtn && soundOffBtn) {
  soundOnBtn.addEventListener('click', () => {
    if (!activeScenario) return;
    startTts(activeScenario.scenario_text);
  });

  soundOffBtn.addEventListener('click', () => {
    stopTts();
  });
}

function buildFeedbackFromAlignment(alignmentKey) {
  const alignment = activeScenario?.alignment_responses?.[alignmentKey];
  if (!alignment) return null;
  return {
    us: alignment.us_feedback || '',
    china: alignment.china_feedback || '',
    cambodia: alignment.cambodia_feedback || '',
    singapore: alignment.singapore_feedback || ''
  };
}

function handleRecommendationChoice(alignmentKey) {
  status.textContent = '';
  if (!activeScenario) {
    status.textContent = 'Select a scenario first.';
    return;
  }

  const blocks = buildFeedbackFromAlignment(alignmentKey);
  if (!blocks) {
    status.textContent = 'No feedback available for this recommendation.';
    return;
  }

  feedbackBlocks = blocks;
  setFeedbackPanels(feedbackBlocks);
  const hasCambodiaFeedback = Boolean(blocks.cambodia);
  feedbackCambodiaBtn.style.display = hasCambodiaFeedback ? 'block' : 'none';
  showFeedback('singapore');
  closePopup(respondPopup);
  openPopup(feedbackPopup);
  status.textContent = '';
}

if (respondMindefBtn) {
  respondMindefBtn.addEventListener('click', () => {
    handleRecommendationChoice('MINDEF_alignment');
  });
}

if (respondMtiBtn) {
  respondMtiBtn.addEventListener('click', () => {
    handleRecommendationChoice('MTI_alignment');
  });
}

if (respondMhaBtn) {
  respondMhaBtn.addEventListener('click', () => {
    handleRecommendationChoice('MHA_non_alignment');
  });
}

feedbackUsBtn.addEventListener('click', () => showFeedback('us'));
feedbackChinaBtn.addEventListener('click', () => showFeedback('china'));
feedbackSingaporeBtn.addEventListener('click', () => showFeedback('singapore'));
feedbackCambodiaBtn.addEventListener('click', () => showFeedback('cambodia'));

Array.from(document.querySelectorAll('.popup-close')).forEach((btn) => {
  btn.addEventListener('click', () => {
    stopTts();
    const popupId = btn.getAttribute('data-close');
    if (popupId) {
      closePopup(document.getElementById(popupId));
    }
  });
});

loadScenarios();

