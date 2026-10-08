const STORAGE_KEY = 'studybudy-question-history-v1';
const MAX_HISTORY = 30;

const form = document.querySelector('#question-form');
const input = document.querySelector('#question-input');
const askButton = document.querySelector('#ask-button');
const responseArea = document.querySelector('#response-area');
const historyList = document.querySelector('#history-list');
const historyCount = document.querySelector('#history-count');
const todayLabel = document.querySelector('#today-label');

const demoLessons = [
  {
    matches: ['variable', 'variables', 'let', 'const', 'var', 'data type', 'primitive type'],
    title: 'A small lesson in variables',
    paragraphs: [
      'A variable is a named place in your program to keep a value. In JavaScript, let is useful when you plan to reassign the variable, while const prevents reassignment and is a good default when the binding should stay the same.',
      'A const object can still have its properties changed; const protects the binding, not the contents. Choosing clear names and understanding the value’s type make code easier to follow.'
    ]
  },
  {
    matches: ['function', 'parameter', 'argument', 'callback', 'arrow function', 'recursion', 'recursive'],
    title: 'A small lesson in functions',
    paragraphs: [
      'A function packages steps so you can run them when needed. Parameters are the named inputs in its definition; arguments are the actual values passed when you call it. A return value is what the function gives back.',
      'Small functions are easier to understand and test. A recursive function calls itself on a smaller problem, and needs a base case that stops the calls.'
    ]
  },
  {
    matches: ['for loop', 'while loop', 'loop', 'iteration', 'iterate'],
    title: 'A small lesson in loops',
    paragraphs: [
      'A loop repeats a block of code, often once for each item or until a condition changes. A for loop is handy when you know what you are iterating over; a while loop continues as long as its condition is true.',
      'Make sure each iteration moves toward the stopping condition. Otherwise, the loop may never end. For arrays, methods like map and filter can express common transformations clearly.'
    ]
  },
  {
    matches: ['array', 'arrays', 'object', 'objects', 'list', 'index', 'property', 'properties'],
    title: 'A small lesson in arrays and objects',
    paragraphs: [
      'An array stores an ordered collection of values. Each item has a zero-based index, so the first item is at index 0. Arrays are useful when you need to work with a sequence of similar items.',
      'An object stores related values under named properties, like a user’s name and email. Use arrays for ordered collections and objects for records with named fields.'
    ]
  },
  {
    matches: ['async', 'await', 'promise', 'asynchronous', 'event loop'],
    title: 'A small lesson in asynchronous JavaScript',
    paragraphs: [
      'Asynchronous code lets JavaScript start work that takes time, such as a network request, without freezing the rest of the page. A Promise represents a result that may be available now, later, or not at all.',
      'The async and await syntax lets you write Promise-based code in a readable sequence. Use try/catch around awaited work when you need to handle failures.'
    ]
  },
  {
    matches: ['api', 'http', 'rest', 'endpoint', 'fetch', 'request', 'response', 'status code'],
    title: 'A small lesson in APIs',
    paragraphs: [
      'An API is a defined way for programs to communicate. A web API commonly accepts an HTTP request at an endpoint and sends back a response, often with JSON data.',
      'The request method describes the action, such as GET to read or POST to submit data. Check the status code and handle errors instead of assuming every request succeeds.'
    ]
  },
  {
    matches: ['git', 'commit', 'branch', 'merge', 'version control', 'pull request'],
    title: 'A small lesson in Git',
    paragraphs: [
      'Git is a version control tool that records changes to your project. A commit saves a checkpoint with a message explaining what changed.',
      'A branch lets you work on a change separately from the main line of development. When the work is ready, you can merge it back, often after reviewing it in a pull request.'
    ]
  },
  {
    matches: ['sql', 'database', 'query', 'table', 'primary key', 'foreign key'],
    title: 'A small lesson in databases',
    paragraphs: [
      'A relational database organizes information into tables with rows and columns. SQL is the language commonly used to read and change that data.',
      'A primary key identifies a row; a foreign key links rows in related tables. Start with a SELECT query to choose the columns and rows you need.'
    ]
  },
  {
    matches: ['debug', 'debugging', 'bug', 'test', 'testing', 'unit test', 'stack trace', 'error'],
    title: 'A small lesson in debugging and tests',
    paragraphs: [
      'Debugging is the process of finding and fixing the cause of a problem. First reproduce the issue, then inspect the error message, stack trace, and relevant variable values to narrow down where behavior differs from what you expected.',
      'A unit test checks one small piece of behavior automatically. A useful test captures the bug with a failing case first, then keeps that case from breaking again later.'
    ]
  }
];

function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((item) =>
      item && typeof item.id === 'string' && typeof item.question === 'string' &&
      typeof item.title === 'string' && Array.isArray(item.paragraphs)
    ) : [];
  } catch {
    return [];
  }
}

let history = readHistory();
let activeId = null;
let pendingTimer = null;

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // The current session still works if browser storage is unavailable.
  }
}

function matchesKeyword(question, keyword) {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedKeyword}\\b`).test(question);
}

function getLesson(question) {
  const normalized = question.toLocaleLowerCase();
  return demoLessons.find((lesson) => lesson.matches.some((word) => matchesKeyword(normalized, word))) || {
    title: 'A starting point for your coding question',
    paragraphs: [
      `You asked: “${question}”`,
      'This is a prepared demo response rather than an AI-generated answer. To explore a programming topic, identify the key concept, trace a small example, and notice how the output changes when you change one part.',
      'Try narrowing your question to a language feature, tool, or error message for a more focused starting point.'
    ]
  };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function renderHistory() {
  historyCount.textContent = `${history.length} ${history.length === 1 ? 'saved' : 'saved'}`;
  historyList.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your question trail will find a home here. Ask something to begin.';
    historyList.append(empty);
    return;
  }

  history.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.dataset.historyId = entry.id;
    button.setAttribute('data-testid', `button-history-${entry.id}`);
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

function renderLesson(entry) {
  responseArea.replaceChildren();
  const question = document.createElement('p');
  question.className = 'answer-question';
  question.textContent = entry.question;
  const title = document.createElement('h3');
  title.textContent = entry.title;
  title.style.cssText = 'margin:0 0 11px;font-size:15px;font-weight:600;';
  const copy = document.createElement('div');
  copy.className = 'answer-copy';
  entry.paragraphs.forEach((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    copy.append(paragraph);
  });
  const meta = document.createElement('div');
  meta.className = 'answer-meta';
  meta.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5c.8 4.3 3.2 6.7 7.5 7.5-4.3.8-6.7 3.2-7.5 7.5-.8-4.3-3.2-6.7-7.5-7.5 4.3-.8 6.7-3.2 7.5-7.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><span>Prepared demo explanation · saved locally</span>';
  responseArea.append(question, title, copy, meta);
  responseArea.setAttribute('data-testid', `status-response-${entry.id}`);
}

function showLoading(question) {
  responseArea.replaceChildren();
  const status = document.createElement('div');
  status.className = 'loading-state';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-label', 'Preparing demo explanation');
  const dots = document.createElement('span');
  dots.className = 'loading-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.innerHTML = '<span></span><span></span><span></span>';
  const message = document.createElement('span');
  message.textContent = 'Gathering a little explanation for your question…';
  status.append(dots, message);
  responseArea.append(status);
}

function submitQuestion(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || askButton.disabled) return;
  window.clearTimeout(pendingTimer);
  askButton.disabled = true;
  askButton.setAttribute('aria-busy', 'true');
  showLoading(cleanQuestion);

  pendingTimer = window.setTimeout(() => {
    const lesson = getLesson(cleanQuestion);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: cleanQuestion,
      title: lesson.title,
      paragraphs: lesson.paragraphs,
      createdAt: new Date().toISOString()
    };
    history = [entry, ...history.filter((saved) => saved.question !== cleanQuestion)].slice(0, MAX_HISTORY);
    activeId = entry.id;
    saveHistory();
    renderHistory();
    renderLesson(entry);
    input.value = '';
    askButton.disabled = false;
    askButton.removeAttribute('aria-busy');
    input.focus();
  }, 850);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitQuestion(input.value);
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelector('#new-question').addEventListener('click', () => {
  input.value = '';
  input.focus();
  activeId = null;
  renderHistory();
  responseArea.innerHTML = '<div class="response-empty"><span class="response-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5c.8 4.3 3.2 6.7 7.5 7.5-4.3.8-6.7 3.2-7.5 7.5-.8-4.3-3.2-6.7-7.5-7.5 4.3-.8 6.7-3.2 7.5-7.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><div><h3>Start with whatever you’re wondering.</h3><p>Your answer will appear here as a short, clearly labeled sample explanation. This prototype works locally — it isn’t connected to an AI service.</p></div></div>';
});

historyList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-history-id]');
  if (!button) return;
  window.clearTimeout(pendingTimer);
  askButton.disabled = false;
  askButton.removeAttribute('aria-busy');
  const entry = history.find((item) => item.id === button.dataset.historyId);
  if (!entry) return;
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
renderHistory();
if (history.length) {
  activeId = history[0].id;
  renderHistory();
  renderLesson(history[0]);
}
