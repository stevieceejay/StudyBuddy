const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.value = ''; this.disabled = false; this.textContent = ''; }
  set innerHTML(value) { throw new Error('Unsafe HTML rendering attempted'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(key, handler) { this.listeners[key] = handler; }
  cloneNode() { const copy = new Element(this.tag); copy.children = [...this.children]; return copy; }
  get childNodes() { return this.children; }
  focus() {}
  setSelectionRange() {}
}
async function renderer() {
  const source = await readFile(path.join(__dirname, '../public/render.js'), 'utf8');
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).buildLesson;
}
const entry = {
  id: 'saved-id', question: 'What is const?', title: 'Bindings', createdAt: '2026-10-08T00:00:00.000Z',
  sections: ['Core idea', 'Example', 'Common pitfall'].map((heading) => ({ heading, content: 'Plain text' }))
};
async function browser(fetchImpl, stored = []) {
  const elements = Object.fromEntries(['question-form', 'question-input', 'ask-button', 'response-area', 'history-list', 'history-count', 'today-label', 'new-question'].map((id) => [id, new Element()]));
  const document = { querySelector: (selector) => elements[selector.slice(1)], querySelectorAll: () => [], createElement: (tag) => new Element(tag) };
  const source = (await readFile(path.join(__dirname, '../public/script.js'), 'utf8')).replace("import { buildLesson } from './render.js';", '');
  const context = vm.createContext({ document, fetch: fetchImpl, localStorage: { getItem: () => JSON.stringify(stored) }, buildLesson: await renderer(), Intl, Date, Set, Array });
  vm.runInContext(source, context);
  await vm.runInContext('historyReady', context);
  return { elements, context };
}
test('model HTML and script payloads render literally as text with the correct headings', async () => {
  const buildLesson = await renderer();
  const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const result = buildLesson({ createElement: (tag) => new Element(tag) }, {
    ...entry, question: payload, title: payload,
    sections: entry.sections.map((section) => ({ ...section, content: payload + '\nconst a = 1;' }))
  });
  assert.equal(result[0].textContent, payload);
  assert.equal(result[1].textContent, payload);
  assert.deepEqual(result[2].children.filter((node) => node.tag === 'h4').map((node) => node.textContent), ['Core idea', 'Example', 'Common pitfall']);
  for (const content of result[2].children.filter((node) => node.tag === 'p')) {
    assert.equal(content.textContent, payload + '\nconst a = 1;');
    assert.equal(content.children.length, 0);
  }
});
test('browser loads server history on refresh and submits questions to the backend', async () => {
  const calls = [];
  const { elements, context } = await browser(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => options ? { ...entry, id: 'new-id' } : { history: [entry] } };
  });
  assert.equal(calls[0].url, '/api/history');
  assert.equal(elements['history-count'].textContent, '1 saved');
  assert.equal(elements['response-area'].children[1].textContent, entry.title);
  await vm.runInContext("submitQuestion('  Explain a variable  ')", context);
  assert.equal(calls[1].url, '/api/chat');
  assert.deepEqual(JSON.parse(calls[1].options.body), { question: 'Explain a variable' });
  assert.equal(elements['history-count'].textContent, '2 saved');
  assert.equal(elements['ask-button'].disabled, false);
  const refreshed = await browser(async () => ({ ok: true, json: async () => ({ history: [{ ...entry, id: 'new-id' }, entry] }) }));
  assert.equal(refreshed.elements['history-count'].textContent, '2 saved');
  assert.equal(refreshed.elements['response-area'].attributes['data-testid'], 'status-response-new-id');
});
test('browser displays API failures, retains question text, and enables retry', async () => {
  const { elements, context } = await browser(async (url, options) => ({ ok: !options, json: async () => options ? { error: 'Unable to save question history.' } : { history: [] } }));
  elements['question-input'].value = 'Explain const';
  await vm.runInContext("submitQuestion('Explain const')", context);
  assert.equal(elements['response-area'].children[0].textContent, 'Unable to save question history.');
  assert.equal(elements['response-area'].children[0].attributes.role, 'alert');
  assert.equal(elements['question-input'].value, 'Explain const');
  assert.equal(elements['ask-button'].disabled, false);
});
test('legacy browser lessons remain readable and a failed history load offers retry', async () => {
  const old = { id: 'old', question: 'Earlier question', title: 'Demo title', paragraphs: ['Earlier demo text'] };
  const { elements } = await browser(async () => { throw new Error('History unavailable'); }, [old]);
  assert.equal(elements['history-count'].textContent, '1 saved');
  assert.equal(elements['history-list'].children.at(-1).textContent, 'Retry history');
  const buildLesson = await renderer();
  const result = buildLesson({ createElement: (tag) => new Element(tag) }, old);
  assert.equal(result[2].children[0].textContent, 'Earlier demo text');
});
