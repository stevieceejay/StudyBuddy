const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('../server/server');

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('chat endpoint returns prepared lessons for junior developer topics', async () => {
  const examples = [
    ['What is the difference between let and const?', 'A small lesson in variables'],
    ['What are function parameters?', 'A small lesson in functions'],
    ['Why does my for loop never stop?', 'A small lesson in loops'],
    ['How do I find an item in an array?', 'A small lesson in arrays and objects'],
    ['How do promises work with async and await?', 'A small lesson in asynchronous JavaScript'],
    ['How do I call an API endpoint?', 'A small lesson in APIs'],
    ['What is a Git commit?', 'A small lesson in Git'],
    ['How do I write a SQL query?', 'A small lesson in databases'],
    ['How should I debug this error?', 'A small lesson in debugging and tests']
  ];

  for (const [question, title] of examples) {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    assert.equal(response.status, 200, question);
    const lesson = await response.json();
    assert.equal(lesson.question, question);
    assert.equal(lesson.title, title);
    assert.ok(Array.isArray(lesson.paragraphs) && lesson.paragraphs.length > 0);
  }
});

test('chat endpoint does not mistake partial words for programming keywords', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'How can I improve rapid sorting?' })
  });

  assert.equal(response.status, 200);
  const lesson = await response.json();
  assert.equal(lesson.title, 'A starting point for your coding question');
});

test('chat endpoint rejects blank questions', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '   ' })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Question cannot be empty.' });
});
