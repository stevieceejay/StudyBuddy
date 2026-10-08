const form = document.querySelector('#question-form');
const input = document.querySelector('#question-input');
const askButton = document.querySelector('#ask-button');
const responseArea = document.querySelector('#response-area');
const historyList = document.querySelector('#history-list');
const historyCount = document.querySelector('#history-count');
const todayLabel = document.querySelector('#today-label');
const initialResponse = responseArea.cloneNode(true);
let history = [];
let activeId = null;
let viewVersion = 0;

// Keep existing browser demo lessons accessible, without changing their storage.
function readLegacyHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem('studybudy-question-history-v1') || '[]');
    return Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry.id === 'string'
      && typeof entry.question === 'string' && typeof entry.title === 'string'
      && Array.isArray(entry.paragraphs) && entry.paragraphs.every((text) => typeof text === 'string')) : [];
  } catch { return []; }
}
const legacyHistory = readLegacyHistory();
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Earlier' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
function renderHistory() {
  historyCount.textContent = `${history.length} saved`;
  historyList.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your question trail will find a home here. Ask something to begin.';
    historyList.append(empty);
  }
  history.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.dataset.historyId = entry.id;
    button.setAttribute('aria-current', entry.id === activeId ? 'true' : 'false');
    const question = document.createElement('span');
    question.className = 'history-question';
    question.textContent = entry.question;
    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = formatDate(entry.createdAt);
    button.append(question, date);
    historyList.append(button);
  });
}
import { buildLesson } from './render.js';
function renderLesson(entry) {
  responseArea.replaceChildren(...buildLesson(document, entry));
  responseArea.setAttribute('data-testid', `status-response-${entry.id}`);
}
function showMessage(message, error = false) {
  const status = document.createElement('p');
  status.className = error ? 'error-message' : 'loading-state';
  status.setAttribute('role', error ? 'alert' : 'status');
  status.textContent = message;
  responseArea.replaceChildren(status);
}
async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Please try again.');
  return data;
}
async function loadHistory() {
  try {
    const data = await apiRequest('/api/history');
    if (!Array.isArray(data.history)) throw new Error('Unable to load saved history.');
    const serverIds = new Set(data.history.map((entry) => entry.id));
    history = [...data.history, ...legacyHistory.filter((entry) => !serverIds.has(entry.id))];
    renderHistory();
    if (history.length && viewVersion === 0) {
      activeId = history[0].id;
      renderHistory();
      renderLesson(history[0]);
    }
  } catch (error) {
    history = legacyHistory;
    renderHistory();
    const notice = document.createElement('p');
    notice.className = 'error-message';
    notice.setAttribute('role', 'alert');
    notice.textContent = error.message || 'Unable to load saved history.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry history';
    retry.addEventListener('click', loadHistory);
    historyList.append(notice, retry);
  }
}
const historyReady = loadHistory();
async function submitQuestion(question) {
  const cleanQuestion = question.trim();
  if (askButton.disabled) return;
  if (!cleanQuestion || cleanQuestion.length > 500) {
    showMessage('Enter a question between 1 and 500 characters.', true);
    return;
  }
  const version = ++viewVersion;
  askButton.disabled = true;
  askButton.setAttribute('aria-busy', 'true');
  showMessage('Preparing your lesson...');
  try {
    await historyReady;
    const entry = await apiRequest('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: cleanQuestion })
    });
    history = [entry, ...history.filter((saved) => saved.id !== entry.id)];
    if (version === viewVersion) {
      activeId = entry.id;
      renderLesson(entry);
      input.value = '';
    }
    renderHistory();
  } catch (error) {
    if (version === viewVersion) showMessage(error.message || 'Cannot reach StudyBuddy. Please try again.', true);
  } finally {
    askButton.disabled = false;
    askButton.removeAttribute('aria-busy');
    if (version === viewVersion) input.focus();
  }
}
form.addEventListener('submit', (event) => { event.preventDefault(); submitQuestion(input.value); });
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelector('#new-question').addEventListener('click', () => {
  viewVersion++;
  input.value = '';
  input.focus();
  activeId = null;
  renderHistory();
  responseArea.replaceChildren(...Array.from(initialResponse.childNodes, (node) => node.cloneNode(true)));
});
historyList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-history-id]');
  if (!button) return;
  const entry = history.find((item) => item.id === button.dataset.historyId);
  if (!entry) return;
  viewVersion++;
  activeId = entry.id;
  renderHistory();
  renderLesson(entry);
});
document.querySelectorAll('.suggestion').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.question;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
});
todayLabel.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date());
