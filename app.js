const classSelect = document.querySelector("#classSelect");
const subjectSelect = document.querySelector("#subjectSelect");
const wordInput = document.querySelector("#wordInput");
const suggestions = document.querySelector("#suggestions");
const selectedWord = document.querySelector("#selectedWord");
const wordSpelling = document.querySelector("#wordSpelling");
const wordPronunciation = document.querySelector("#wordPronunciation");
const speakButton = document.querySelector("#speakButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const lookupStatus = document.querySelector("#lookupStatus");

const HISTORY_LIMIT = 12;
const STORE_PREFIX = "ifp-word-history";
let wordData = {};
let activeWord = "";

function historyKey() {
  return `${STORE_PREFIX}:${classSelect.value}:${subjectSelect.value}`;
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

function currentWords() {
  return wordData[subjectSelect.value] || [];
}

function findWord(value) {
  const lowerValue = value.trim().toLowerCase();
  return currentWords().find((entry) => entry.word.toLowerCase() === lowerValue);
}

function setStatus(message, isWarning = false) {
  lookupStatus.textContent = message;
  lookupStatus.classList.toggle("is-warning", isWarning);
}

function showWord(entry) {
  activeWord = entry.word;
  selectedWord.textContent = entry.word;
  wordSpelling.textContent = spellingFor(entry);
  wordPronunciation.textContent = normalizePronunciation(pronunciationFor(entry));
  speakButton.disabled = false;
  saveHistory(entry.word);
  setStatus(`Saved to Class ${classSelect.value} ${subjectSelect.value} history.`);
}

function resetWord(message = "Select a word from the suggestions.") {
  activeWord = "";
  selectedWord.textContent = "-";
  wordSpelling.textContent = "-";
  wordPronunciation.textContent = "-";
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

  resetWord(`No ${subjectSelect.value} JSON entry found for "${value}".`);
  setStatus(`No ${subjectSelect.value} JSON entry found for "${value}".`, true);
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
  wordInput.value = "";
  renderSuggestions(false);
  resetWord(`Class ${classSelect.value} ${subjectSelect.value} ready.`);
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

async function boot() {
  bootClassOptions();

  try {
    const response = await fetch("words.json");
    wordData = await response.json();
    resetWord("Pick English and start with Red, Yellow, or Blue.");
  } catch {
    wordData = {};
    resetWord("Could not load words.json.");
    setStatus("Could not load words.json.", true);
  }

  wordInput.addEventListener("input", () => {
    renderSuggestions();
    lookupWord();
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
    if (!event.target.closest(".word-field") && !event.target.closest(".suggestions")) {
      renderSuggestions(false);
    }
  });
  classSelect.addEventListener("change", syncForSelectionChange);
  subjectSelect.addEventListener("change", syncForSelectionChange);
  speakButton.addEventListener("click", speakWord);
  clearHistoryButton.addEventListener("click", clearHistory);
}

boot();
