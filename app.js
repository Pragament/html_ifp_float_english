const classSelect = document.querySelector("#classSelect");
const subjectSelect = document.querySelector("#subjectSelect");
const wordInput = document.querySelector("#wordInput");
const suggestions = document.querySelector("#suggestions");
const wordRow = document.querySelector(".word-row");
const selectedWord = document.querySelector("#selectedWord");
const wordSpelling = document.querySelector("#wordSpelling");
const wordPronunciation = document.querySelector("#wordPronunciation");
const exampleSentence = document.querySelector("#exampleSentence");
const speakButton = document.querySelector("#speakButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const pasteButton = document.querySelector("#pasteButton");
const randomWordButton = document.querySelector("#randomWordButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const lookupStatus = document.querySelector("#lookupStatus");
const webllmModelSelect = document.querySelector("#webllmModelSelect");
const loadWebllmButton = document.querySelector("#loadWebllmButton");
const submitWebllmButton = document.querySelector("#submitWebllmButton");
const webllmStatus = document.querySelector("#webllmStatus");

const HISTORY_LIMIT = 12;
const STORE_PREFIX = "ifp-word-history";
const SETTINGS_KEY = "ifp-tutor-settings";
const ZOOM_KEY = "ifp-tutor-zoom";
const WEBLLM_MODEL_KEY = "ifp-tutor-webllm-model";
const WEBLLM_MODULE_URL = "https://esm.run/@mlc-ai/web-llm";
const DEFAULT_WEBLLM_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const WEBLLM_MODELS = [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "gemma3-1b-it-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC"
];
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;
let wordData = [];
let activeWord = "";
let restoredWordValue = "";
let webllmModulePromise = null;
let webllmEngine = null;
let webllmEnginePromise = null;
let loadedWebllmModel = "";
let webllmLoadToken = 0;
let aiLookupToken = 0;
let pendingWebLLMWord = "";

function historyKey() {
  return `${STORE_PREFIX}:${classSelect.value}:${subjectSelect.value}`;
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings() {
  const settings = {
    classValue: classSelect.value,
    subjectValue: subjectSelect.value,
    wordValue: wordInput.value.trim()
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey())) || [];
  } catch {
    return [];
  }
}

function saveHistory(word) {
  const cleanWord = word.trim();
  if (!cleanWord) return;

  const history = getHistory().filter((item) => item.toLowerCase() !== cleanWord.toLowerCase());
  history.unshift(cleanWord);
  localStorage.setItem(historyKey(), JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function clearHistory() {
  localStorage.removeItem(historyKey());
  renderSuggestions();
}

function confirmClearHistory() {
  if (window.confirm("Clear recent words?")) {
    clearHistory();
  }
}

function normalizePronunciation(value) {
  return value.replace(/\*\*/g, "").trim();
}

function spellingFor(entry) {
  return entry.Spelling || entry.spelling || "-";
}

function pronunciationFor(entry) {
  return entry["Easy Pronunciation"] || entry.easyPronunciation || "-";
}

function sentenceFor(entry) {
  return entry["Example Sentence"] || entry.exampleSentence || "-";
}

function currentWords() {
  return wordData;
}

function findWord(value) {
  const lowerValue = value.trim().toLowerCase();
  return currentWords().find((entry) => entry.word.toLowerCase() === lowerValue);
}

function setStatus(message, isWarning = false) {
  lookupStatus.textContent = message;
  lookupStatus.classList.toggle("is-warning", isWarning);
}

function setWebLLMStatus(message, isWarning = false) {
  webllmStatus.textContent = message;
  webllmStatus.classList.toggle("is-warning", isWarning);
}

function setWordRowVisible(isVisible) {
  wordRow.hidden = !isVisible;
}

function setWebLLMSubmitVisible(isVisible) {
  submitWebllmButton.hidden = !isVisible;
}

function showWord(entry, options = {}) {
  activeWord = entry.word;
  setWordRowVisible(true);
  setWebLLMSubmitVisible(false);
  selectedWord.textContent = entry.word;
  wordSpelling.textContent = spellingFor(entry);
  wordPronunciation.textContent = normalizePronunciation(pronunciationFor(entry), entry.word);
  exampleSentence.textContent = sentenceFor(entry);
  speakButton.disabled = false;

  if (options.save !== false) {
    saveHistory(entry.word);
    saveSettings();
  }

  setStatus(options.status || `Saved to Class ${classSelect.value} ${subjectSelect.value} history.`);
}

function resetWord(message = "Select a word from the suggestions.") {
  activeWord = "";
  setWordRowVisible(true);
  setWebLLMSubmitVisible(false);
  selectedWord.textContent = "Selected Word";
  wordSpelling.textContent = "Spelling";
  wordPronunciation.textContent = "Easy Pronunciation";
  exampleSentence.textContent = "Example sentence";
  speakButton.disabled = true;
  setStatus(message);
}

function showTypedWord(value, message, isWarning = false) {
  activeWord = value.trim();
  setWordRowVisible(false);
  setWebLLMSubmitVisible(Boolean(activeWord));
  exampleSentence.textContent = "Example sentence";
  speakButton.disabled = !activeWord;
  setStatus(message, isWarning);
}

function showLoadingAIWord(value) {
  activeWord = value.trim();
  pendingWebLLMWord = activeWord;
  setWordRowVisible(false);
  exampleSentence.textContent = "Asking WebLLM for an example sentence...";
  speakButton.disabled = false;
  setStatus(`No JSON entry found for "${activeWord}". Using WebLLM.`);
}

function suggestionButton(word, source) {
  const button = document.createElement("button");
  const wordLabel = document.createElement("span");
  const sourceLabel = document.createElement("small");

  button.className = "suggestion";
  button.type = "button";
  button.setAttribute("role", "option");
  wordLabel.textContent = word;
  sourceLabel.textContent = source;
  button.append(wordLabel, sourceLabel);
  button.addEventListener("click", () => {
    wordInput.value = word;
    renderSuggestions(false);
    lookupWord();
  });
  return button;
}

function renderSuggestions(forceOpen = true) {
  const typed = wordInput.value.trim().toLowerCase();
  suggestions.replaceChildren();

  const items = typed
    ? currentWords()
        .filter((entry) => entry.word.toLowerCase().startsWith(typed))
        .map((entry) => ({ word: entry.word, source: "word" }))
    : getHistory().map((word) => ({ word, source: "recent" }));

  items.forEach((item) => suggestions.append(suggestionButton(item.word, item.source)));
  suggestions.classList.toggle("is-open", forceOpen && items.length > 0);
}

function lookupWord() {
  const value = wordInput.value.trim();
  const entry = findWord(value);
  ++aiLookupToken;

  if (entry) {
    showWord(entry);
    return;
  }

  if (!value) {
    resetWord("Type a word or choose from recent history.");
    return;
  }

  saveSettings();
  pendingWebLLMWord = value;
  showTypedWord(value, `No JSON entry found for "${value}". Press Generate Example Sentence.`, true);
}

function savedWebLLMModel() {
  const savedModel = localStorage.getItem(WEBLLM_MODEL_KEY);
  return WEBLLM_MODELS.includes(savedModel) ? savedModel : DEFAULT_WEBLLM_MODEL;
}

function populateWebLLMModels() {
  const selectedModel = savedWebLLMModel();
  const fragment = document.createDocumentFragment();

  WEBLLM_MODELS.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    fragment.append(option);
  });

  webllmModelSelect.append(fragment);
  webllmModelSelect.value = selectedModel;
}

function saveSelectedWebLLMModel() {
  localStorage.setItem(WEBLLM_MODEL_KEY, webllmModelSelect.value);
}

function importWebLLM() {
  if (!webllmModulePromise) {
    webllmModulePromise = import(WEBLLM_MODULE_URL);
  }

  return webllmModulePromise;
}

async function loadWebLLMModel(modelId = webllmModelSelect.value) {
  if (!navigator.gpu) {
    setWebLLMStatus("WebGPU is not available in this browser.", true);
    throw new Error("WebGPU is not available.");
  }

  if (webllmEngine && loadedWebllmModel === modelId) {
    setWebLLMStatus(`Loaded cached model: ${modelId}`);
    return webllmEngine;
  }

  if (webllmEnginePromise && loadedWebllmModel === modelId) {
    return webllmEnginePromise;
  }

  const loadToken = ++webllmLoadToken;
  loadedWebllmModel = modelId;
  loadWebllmButton.disabled = true;
  setWebLLMStatus(`Loading ${modelId}. First run downloads it; future loads use browser cache.`);

  webllmEnginePromise = (async () => {
    try {
      const webllm = await importWebLLM();
      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          if (loadToken === webllmLoadToken) {
            setWebLLMStatus(report.text || `Loading ${modelId}...`);
          }
        }
      });

      if (loadToken !== webllmLoadToken) {
        return engine;
      }

      webllmEngine = engine;
      setWebLLMStatus(`Ready: ${modelId}`);
      return engine;
    } catch (error) {
      if (loadToken === webllmLoadToken) {
        loadedWebllmModel = "";
        setWebLLMStatus("Could not load WebLLM model.", true);
      }
      throw error;
    } finally {
      if (loadToken === webllmLoadToken) {
        loadWebllmButton.disabled = false;
      }
    }
  })();

  return webllmEnginePromise;
}

async function generateWebLLMWord(value, lookupToken) {
  showLoadingAIWord(value);
  let debugRequest = null;
  let debugResponse = null;
  let debugContent = "";

  try {
    const engine = await loadWebLLMModel();
    if (lookupToken !== aiLookupToken) return;

    const messages = [
      {
        role: "system",
        content: "You help young English learners. Write only one simple example sentence."
      },
      {
        role: "user",
        content: `Write one simple example sentence using the word: ${value}`
      }
    ];
    const request = {
      messages,
      temperature: 0.2,
      max_tokens: 120
    };
    debugRequest = request;

    console.log("[WebLLM] word generation request", {
      word: value,
      model: loadedWebllmModel,
      request
    });

    const response = await engine.chat.completions.create({
      messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens
    });
    debugResponse = response;

    if (lookupToken !== aiLookupToken) return;

    const content = response.choices?.[0]?.message?.content || "";
    debugContent = content;

    console.log("[WebLLM] word generation response", {
      word: value,
      model: loadedWebllmModel,
      rawResponse: response,
      content
    });

    if (!content.trim()) {
      throw new Error("WebLLM returned an empty response.");
    }

    activeWord = value;
    setWordRowVisible(false);
    setWebLLMSubmitVisible(false);
    exampleSentence.textContent = content.trim();
    speakButton.disabled = false;
    saveHistory(value);
    saveSettings();
    setStatus(`Generated example sentence with WebLLM because "${value}" is not in words.json.`);
    pendingWebLLMWord = "";
  } catch (error) {
    if (lookupToken !== aiLookupToken) return;
    pendingWebLLMWord = value;
    console.error("[WebLLM] word generation failed", {
      word: value,
      model: loadedWebllmModel,
      request: debugRequest,
      rawResponse: debugResponse,
      content: debugContent,
      error
    });
    showTypedWord(value, `No JSON entry found for "${value}". WebLLM could not generate it yet.`, true);
  }
}

function submitWebLLMLookup() {
  const value = wordInput.value.trim();

  if (!value) {
    resetWord("Type a word before using WebLLM.");
    return;
  }

  const entry = findWord(value);
  if (entry) {
    showWord(entry);
    return;
  }

  saveHistory(value);
  saveSettings();
  generateWebLLMWord(value, ++aiLookupToken);
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function wordOfTheDay() {
  if (!wordData.length) return null;

  const seedText = todayKey();
  let seed = 0;

  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) % wordData.length;
  }

  return wordData[seed];
}

function showWordOfTheDay() {
  const entry = wordOfTheDay();
  if (!entry) {
    resetWord("No words found in words.json.");
    return;
  }

  wordInput.value = entry.word;
  showWord(entry, {
    save: false,
    status: `Word of the day for ${todayKey()}.`
  });
}

function randomWord() {
  if (!wordData.length) return null;
  if (wordData.length === 1) return wordData[0];

  let entry = wordData[Math.floor(Math.random() * wordData.length)];

  while (entry.word === activeWord) {
    entry = wordData[Math.floor(Math.random() * wordData.length)];
  }

  return entry;
}

function showRandomWord() {
  const entry = randomWord();
  if (!entry) {
    resetWord("No words found in words.json.");
    return;
  }

  wordInput.value = entry.word;
  renderSuggestions(false);
  showWord(entry, {
    status: "New random word."
  });
}

async function pasteFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    setStatus("Clipboard paste is not available in this browser.", true);
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    const word = text.trim().split(/\s+/)[0] || "";

    if (!word) {
      resetWord("Clipboard is empty.");
      return;
    }

    wordInput.value = word;
    renderSuggestions(false);
    lookupWord();
    saveSettings();
  } catch {
    setStatus("Clipboard permission was blocked.", true);
  }
}

function speakWord() {
  if (!activeWord || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(activeWord);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function syncForSelectionChange() {
  saveSettings();
  renderSuggestions(false);
  lookupWord();
}

function bootClassOptions() {
  const fragment = document.createDocumentFragment();

  for (let index = 1; index <= 10; index += 1) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `Class ${index}`;
    fragment.append(option);
  }

  classSelect.append(fragment);
}

function restoreSettings() {
  const settings = getSettings();

  if (settings.classValue) classSelect.value = settings.classValue;
  if (settings.subjectValue) subjectSelect.value = settings.subjectValue;
  restoredWordValue = settings.wordValue || "";
  if (restoredWordValue) wordInput.value = restoredWordValue;
}

function applyZoom(value) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || 1));
  document.body.style.zoom = String(zoom);
  localStorage.setItem(ZOOM_KEY, String(zoom));
}

function restoreZoom() {
  applyZoom(localStorage.getItem(ZOOM_KEY) || 1);
}

function changeZoom(delta) {
  const currentZoom = Number(localStorage.getItem(ZOOM_KEY)) || 1;
  applyZoom((currentZoom + delta).toFixed(2));
}

async function boot() {
  bootClassOptions();
  populateWebLLMModels();
  restoreSettings();
  restoreZoom();

  try {
    const response = await fetch("words.json");
    wordData = await response.json();
    if (restoredWordValue) {
      lookupWord();
    } else {
      showWordOfTheDay();
    }
  } catch {
    wordData = [];
    resetWord("Could not load words.json.");
    setStatus("Could not load words.json.", true);
  }

  wordInput.addEventListener("input", () => {
    renderSuggestions();
    lookupWord();
    saveSettings();
  });
  wordInput.addEventListener("focus", () => renderSuggestions());
  wordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      renderSuggestions(false);
      lookupWord();
    }
    if (event.key === "Escape") renderSuggestions(false);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#wordInput") && !event.target.closest(".suggestions")) {
      renderSuggestions(false);
    }
  });
  classSelect.addEventListener("change", syncForSelectionChange);
  subjectSelect.addEventListener("change", syncForSelectionChange);
  speakButton.addEventListener("click", speakWord);
  clearHistoryButton.addEventListener("click", confirmClearHistory);
  pasteButton.addEventListener("click", pasteFromClipboard);
  randomWordButton.addEventListener("click", showRandomWord);
  webllmModelSelect.addEventListener("change", () => {
    saveSelectedWebLLMModel();
    loadWebLLMModel().catch(() => {});
  });
  loadWebllmButton.addEventListener("click", () => {
    saveSelectedWebLLMModel();
    loadWebLLMModel().catch(() => {});
  });
  submitWebllmButton.addEventListener("click", submitWebLLMLookup);
  zoomOutButton.addEventListener("click", () => changeZoom(-ZOOM_STEP));
  zoomInButton.addEventListener("click", () => changeZoom(ZOOM_STEP));
  loadWebLLMModel().catch(() => {});
}

boot();
