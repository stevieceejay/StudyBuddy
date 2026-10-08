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
    matches: ['photosynthesis', 'plant', 'leaves change color', 'leaves changing color', 'autumn'],
    title: 'A small lesson in plants',
    paragraphs: [
      'Plants use photosynthesis to turn light into stored chemical energy. In leaves, chlorophyll captures sunlight and helps combine water from the roots with carbon dioxide from the air.',
      'That process makes sugars the plant can use to grow, and releases oxygen along the way. In autumn, many trees stop making as much chlorophyll, so other pigments already in the leaves become easier to see.'
    ]
  },
  {
    matches: ['gravity', 'fall', 'moon', 'orbit'],
    title: 'A small lesson in gravity',
    paragraphs: [
      'Gravity is the attraction between things that have mass. Earth’s gravity pulls objects toward its center, which is why a dropped pencil falls instead of drifting away.',
      'The Moon is also pulled by Earth, but its sideways motion keeps it continually falling around our planet. That balance is what we call an orbit.'
    ]
  },
  {
    matches: ['rainbow', 'light', 'color'],
    title: 'A small lesson in light',
    paragraphs: [
      'Sunlight looks white, but it contains many colors. When light enters a raindrop it bends, reflects inside, and bends again as it leaves.',
      'Different colors bend by slightly different amounts, spreading the light into an arc of color. You usually see a rainbow when the Sun is behind you and rain is ahead.'
    ]
  },
  {
    matches: ['derivative', 'calculus', 'slope', 'rate of change'],
    title: 'A small lesson in calculus',
    paragraphs: [
      'A derivative describes how quickly something is changing at a particular moment. If a graph shows distance over time, its derivative at one point is the object’s speed at that moment.',
      'You can picture it as the slope of a tiny piece of the curve. A steeper slope means a faster rate of change; a flat slope means little or no change right then.'
    ]
  },
  {
    matches: ['atom', 'molecule', 'matter'],
    title: 'A small lesson in matter',
    paragraphs: [
      'An atom is a tiny building block of ordinary matter. It has a dense center made of protons and neutrons, with electrons occupying the space around it.',
      'Atoms can join through chemical bonds. When atoms connect in particular arrangements, they form molecules — water, for example, is made from two hydrogen atoms and one oxygen atom.'
    ]
  },
  {
    matches: ['habit', 'habits', 'routine', 'stick'],
    title: 'A small lesson in habits',
    paragraphs: [
      'A habit is a behavior that becomes easier to repeat because it is linked to a familiar cue and context. Making the first step small and attaching it to something you already do can lower the effort of getting started.',
      'Repeating the behavior in a stable situation gives your brain a chance to learn the pattern. It is practice, not a perfect streak, that makes a routine feel more familiar.'
    ]
  },
  {
    matches: ['democracy', 'government', 'vote', 'election'],
    title: 'A small lesson in civic life',
    paragraphs: [
      'Democracy is a way of organizing public decisions in which people have a meaningful role. In a representative democracy, people choose representatives to debate and make many decisions on their behalf.',
      'The details differ across countries, but elections, public participation, and limits on political power are common parts of democratic systems.'
    ]
  },
  {
    matches: ['recursion', 'program', 'code', 'javascript'],
    title: 'A small lesson in programming',
    paragraphs: [
      'Recursion is a technique where a function solves a problem by calling itself on a smaller version of that problem. It is useful when a task naturally contains smaller copies of itself, such as exploring nested folders.',
      'A recursive solution needs a base case — a condition that stops the calls — as well as a step that makes progress toward that case.'
    ]
  },
  {
    matches: ['inflation', 'price', 'prices', 'economy'],
    title: 'A small lesson in economics',
    paragraphs: [
      'Inflation is a broad rise in prices over time. When prices rise, the same amount of money generally buys fewer goods and services than it did before.',
      'It is usually measured by tracking the cost of a selected basket of items. The price of one item changing is not, by itself, the same thing as overall inflation.'
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

function getLesson(question) {
  const normalized = question.toLocaleLowerCase();
  return demoLessons.find((lesson) => lesson.matches.some((word) => normalized.includes(word))) || {
    title: 'A starting point for your question',
    paragraphs: [
      `You asked: “${question}”`,
      'This is a prepared demo response rather than a generated answer. A helpful way into a new topic is to name its key idea, look for a concrete example, and then ask what changes when one part of that example changes.',
      'Try narrowing your question to one term or relationship, and use that as a trailhead for your next bit of learning.'
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
