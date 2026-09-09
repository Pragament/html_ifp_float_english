const classSelect = document.querySelector("#classSelect");
const subjectSelect = document.querySelector("#subjectSelect");
const wordInput = document.querySelector("#wordInput");
const suggestions = document.querySelector("#suggestions");
const selectedWord = document.querySelector("#selectedWord");
const wordSpelling = document.querySelector("#wordSpelling");
const wordPronunciation = document.querySelector("#wordPronunciation");
const exampleSentence = document.querySelector("#exampleSentence");
const speakButton = document.querySelector("#speakButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const randomWordButton = document.querySelector("#randomWordButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const lookupStatus = document.querySelector("#lookupStatus");

const HISTORY_LIMIT = 12;
const STORE_PREFIX = "ifp-word-history";
const SETTINGS_KEY = "ifp-tutor-settings";
const ZOOM_KEY = "ifp-tutor-zoom";
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;
let wordData = [];
let activeWord = "";
let restoredWordValue = "";

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

function normalizePronunciation(value) {
  return value.replace(/\*\*/g, "");
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

function showWord(entry, options = {}) {
  activeWord = entry.word;
  selectedWord.textContent = entry.word;
  wordSpelling.textContent = spellingFor(entry);
  wordPronunciation.textContent = normalizePronunciation(pronunciationFor(entry));
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
  selectedWord.textContent = "Selected Word";
  wordSpelling.textContent = "Spelling";
  wordPronunciation.textContent = "Easy Pronunciation";
  exampleSentence.textContent = "Example sentence";
  speakButton.disabled = true;
  setStatus(message);
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

  if (entry) {
    showWord(entry);
    return;
  }

  if (!value) {
    resetWord("Type a word or choose from recent history.");
    return;
  }

  saveSettings();
  resetWord(`No JSON entry found for "${value}".`);
  setStatus(`No JSON entry found for "${value}".`, true);
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
  clearHistoryButton.addEventListener("click", clearHistory);
  randomWordButton.addEventListener("click", showRandomWord);
  zoomOutButton.addEventListener("click", () => changeZoom(-ZOOM_STEP));
  zoomInButton.addEventListener("click", () => changeZoom(ZOOM_STEP));
}

boot();
