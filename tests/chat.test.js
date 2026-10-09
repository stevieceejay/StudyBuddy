const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { createServer, createHistoryStore } = require('../server/server');
const lesson = {
  is_programming_related: true,
  title: 'Understanding const',
  sections: [
    { heading: 'Core idea', content: 'const prevents reassignment of a binding.' },
    { heading: 'Example', content: 'const count = 3;\nconsole.log(count);' },
    { heading: 'Common pitfall', content: 'Object properties can still change.' }
  ]
};
const envelope = (value = lesson) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
async function setup(t, options = {}) {
  const directory = await mkdtemp(path.join(__dirname, '.studybuddy-test-'));
  const historyFile = path.join(directory, 'history.json');
  const calls = [];
  const server = createServer({ historyFile, apiKey: 'mock-key', fetchImpl: async (url, request) => {
    calls.push({ url, request });
    return { ok: true, json: async () => envelope() };
  }, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(`${path.resolve(__dirname)}${path.sep}.studybuddy-test-`));
    await rm(resolved, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const chat = (body) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, chat, calls, historyFile, directory };
}
test('validated lesson uses the prompt and strict schema; server generates metadata and persists the complete entry', async (t) => {
  const { chat, calls, historyFile, base } = await setup(t);
  const result = await chat({ question: '  What is const?  ', id: 'user-controlled', createdAt: 'fake' });
  assert.equal(result.status, 200);
  const entry = await result.json();
  assert.deepEqual(Object.keys(entry), ['id', 'question', 'title', 'sections', 'createdAt']);
  assert.match(entry.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(entry.question, 'What is const?');
  assert.equal(new Date(entry.createdAt).toISOString(), entry.createdAt);
  assert.deepEqual(entry.sections, lesson.sections);
  assert.deepEqual(JSON.parse(await readFile(historyFile, 'utf8')), [entry]);
  assert.deepEqual(await (await fetch(`${base}/api/history`)).json(), { history: [entry] });
  const request = JSON.parse(calls[0].request.body);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer mock-key');
  assert.equal(request.input, 'What is const?');
  assert.equal(request.instructions, await readFile(path.join(__dirname, '../prompts/studybuddy.md'), 'utf8'));
  assert.match(request.instructions, /Follow-up questions are allowed/);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.ok(request.text.format.schema.required.includes('is_programming_related'));
  assert.equal(request.text.format.schema.properties.sections.minItems, 3);
  assert.equal(request.text.format.schema.properties.sections.maxItems, 3);
  assert.equal(request.store, false);
});
test('invalid questions never call OpenAI or save history', async (t) => {
  const { chat, calls, base } = await setup(t);
  for (const body of [{}, { question: 3 }, { question: null }, { question: '  ' }, { question: 'a'.repeat(501) }, []]) {
    assert.equal((await chat(body)).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await (await fetch(`${base}/api/history`)).json(), { history: [] });
});
test('unrelated questions are rejected and never saved', async (t) => {
  let classificationCalls = 0;
  const { chat, base } = await setup(t, {
    fetchImpl: async () => {
      classificationCalls++;
      return { ok: true, json: async () => envelope({
        ...lesson,
        is_programming_related: false,
        title: 'A weather forecast',
        sections: lesson.sections.map((section) => ({ ...section, content: 'This is not a programming question.' }))
      }) };
    }
  });

  const response = await chat({ question: 'What will the weather be tomorrow?' });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /programming and software development/);
  assert.equal(classificationCalls, 1);
  assert.deepEqual(await (await fetch(`${base}/api/history`)).json(), { history: [] });
});
test('malformed JSON, oversized bodies, unsupported methods and unknown API routes are handled', async (t) => {
  const { base, calls } = await setup(t);
  const post = (body) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await post('{broken')).status, 400);
  assert.equal((await post(JSON.stringify({ question: 'a'.repeat(17000) }))).status, 413);
  assert.equal((await fetch(`${base}/api/chat`)).status, 405);
  assert.equal((await fetch(`${base}/api/history`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  assert.equal(calls.length, 0);
});
test('every model field is validated, including exactly three ordered headings', async (t) => {
  const invalid = [null, [], {}, { ...lesson, title: '' }, { ...lesson, title: 42 }, { ...lesson, title: 'x'.repeat(201) },
    { ...lesson, is_programming_related: 'yes' }, { ...lesson, extra: true },
    { ...lesson, sections: lesson.sections.slice(1) }, { ...lesson, sections: [...lesson.sections, lesson.sections[0]] },
    { ...lesson, sections: [lesson.sections[1], lesson.sections[0], lesson.sections[2]] },
    ...[{}, { heading: 'Wrong', content: 'text' }, { heading: 'Core idea', content: '' }, { heading: 'Core idea', content: '  ' },
      { heading: 'Core idea', content: 42 }, { heading: 'Core idea', content: 'x'.repeat(10001) },
      { ...lesson.sections[0], extra: true }].map((section) => ({ ...lesson, sections: [section, ...lesson.sections.slice(1)] }))];
  let current;
  const { chat, base } = await setup(t, { fetchImpl: async () => ({ ok: true, json: async () => envelope(current) }) });
  for (const value of invalid) {
    current = value;
    assert.equal((await chat({ question: 'What is const?' })).status, 502, JSON.stringify(value));
  }
  assert.deepEqual(await (await fetch(`${base}/api/history`)).json(), { history: [] });
});
test('API failures and timeouts return safe errors without upstream secrets', async (t) => {
  for (const fetchImpl of [async () => { throw new Error('private mock-key'); }, async () => ({ ok: false, status: 429 })]) {
    const { chat } = await setup(t, { fetchImpl });
    const result = await chat({ question: 'Explain a variable' });
    assert.equal(result.status, 502);
    assert.doesNotMatch(await result.text(), /mock-key|private/);
  }
});
test('refusals, incomplete output, missing text and malformed JSON are rejected', async (t) => {
  const responses = [
    { ...envelope(), status: 'incomplete' }, { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] }
  ];
  for (const value of responses) {
    const { chat } = await setup(t, { fetchImpl: async () => ({ ok: true, json: async () => value }) });
    assert.equal((await chat({ question: 'Explain a variable' })).status, 502);
  }
});
test('missing API key or instructions gives a configuration error', async (t) => {
  for (const options of [{ apiKey: '' }, { instructions: '' }]) {
    const { chat, calls } = await setup(t, options);
    assert.equal((await chat({ question: 'Explain a variable' })).status, 503);
    assert.equal(calls.length, 0);
  }
});
test('storage read and write failures report errors and do not return unsaved lessons as successes', async (t) => {
  const { chat, base } = await setup(t, { historyStore: {
    readHistory: async () => { throw new Error('private path'); },
    saveEntry: async () => { throw new Error('private path'); }
  } });
  const result = await chat({ question: 'Explain a variable' });
  assert.equal(result.status, 500);
  assert.match((await result.json()).error, /not saved/);
  const history = await fetch(`${base}/api/history`);
  assert.equal(history.status, 500);
  assert.doesNotMatch(await history.text(), /private/);
});
test('simultaneous submissions and repeated questions are all preserved across a new store', async (t) => {
  const { chat, historyFile } = await setup(t);
  const results = await Promise.all(Array.from({ length: 6 }, () => chat({ question: 'What is const?' })));
  const entries = await Promise.all(results.map((result) => { assert.equal(result.status, 200); return result.json(); }));
  const history = await createHistoryStore(historyFile).readHistory();
  assert.equal(history.length, 6);
  assert.equal(new Set(history.map((entry) => entry.id)).size, 6);
  for (const entry of entries) assert.ok(history.some((saved) => saved.id === entry.id));
});
test('corrupt history is preserved, and the write queue recovers after a failure', async (t) => {
  const { historyFile } = await setup(t);
  await writeFile(historyFile, '{broken');
  const store = createHistoryStore(historyFile);
  await assert.rejects(store.saveEntry({ id: 'test' }));
  assert.equal(await readFile(historyFile, 'utf8'), '{broken');
  await writeFile(historyFile, '[]');
  await store.saveEntry({ id: 'test' });
  assert.deepEqual(await store.readHistory(), [{ id: 'test' }]);
});
test('real filesystem write errors and existing demo history are handled', async (t) => {
  const { directory } = await setup(t);
  const blocked = path.join(directory, 'blocked');
  await writeFile(blocked, 'file');
  await assert.rejects(createHistoryStore(path.join(blocked, 'history.json')).saveEntry({ id: 'test' }));
  const legacyFile = path.join(directory, 'legacy.json');
  const legacy = { id: 'old', question: 'Variables?', title: 'Demo', paragraphs: ['Earlier explanation'], createdAt: '2026-01-01T00:00:00.000Z' };
  await writeFile(legacyFile, JSON.stringify([legacy]));
  const store = createHistoryStore(legacyFile);
  await store.saveEntry({ id: 'new' });
  assert.deepEqual((await store.readHistory())[1], legacy);
});
test('serves the existing page while keeping server files and secrets inaccessible', async (t) => {
  const { base } = await setup(t);
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /question-form/);
  for (const route of ['/.env', '/server/server.js', '/prompts/studybuddy.md', '/data/history.json']) {
    assert.equal((await fetch(`${base}${route}`)).status, 404);
  }
});
