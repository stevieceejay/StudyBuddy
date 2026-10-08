const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { requestLesson, validateLesson } = require('../server/server');

try { process.loadEnvFile(path.join(__dirname, '../.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

test('LIVE: OpenAI returns a valid three-section lesson', {
  skip: !process.env.OPENAI_API_KEY && 'No OPENAI_API_KEY configured; no live API request was made.'
}, async () => {
  const lesson = await requestLesson({
    question: 'Explain let versus const in JavaScript.',
    instructions: await readFile(path.join(__dirname, '../prompts/studybuddy.md'), 'utf8'),
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini', fetchImpl: fetch
  });
  assert.equal(validateLesson(lesson), lesson);
});
