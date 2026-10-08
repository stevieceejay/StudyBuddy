const express = require('express');
const { createServer: createHttpServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { mkdir, readFile, writeFile, rename, rm } = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const HEADINGS = ['Core idea', 'Example', 'Common pitfall'];
const lessonSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'sections'],
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['heading', 'content'],
        properties: { heading: { type: 'string', enum: HEADINGS }, content: { type: 'string' } }
      }
    }
  }
};
function hasKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function validateLesson(value) {
  if (!hasKeys(value, ['title', 'sections']) || !validText(value.title, 200)
      || !Array.isArray(value.sections) || value.sections.length !== 3
      || !value.sections.every((section, index) => hasKeys(section, ['heading', 'content'])
        && section.heading === HEADINGS[index] && validText(section.content, 10000))) {
    throw new Error('Invalid lesson response.');
  }
  return value;
}
// Serialize writes so simultaneous requests cannot overwrite each other.
// Rename publishes a complete file after the temporary file is written.
function createHistoryStore(filePath) {
  let queue = Promise.resolve();
  async function readFileHistory() {
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(value)) throw new Error('Invalid history file.');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  return {
    async readHistory() { await queue; return readFileHistory(); },
    saveEntry(entry) {
      const operation = queue.then(async () => {
        const history = await readFileHistory();
        await mkdir(path.dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporaryPath, `${JSON.stringify([entry, ...history], null, 2)}\n`, 'utf8');
          await rename(temporaryPath, filePath);
        } finally {
          await rm(temporaryPath, { force: true }).catch(() => {});
        }
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
async function requestLesson({ question, instructions, apiKey, model, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, instructions, input: question, store: false, max_output_tokens: 2500,
        text: { format: { type: 'json_schema', name: 'studybuddy_lesson', strict: true, schema: lessonSchema } }
      }),
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    throw Object.assign(new Error('The tutor service is unavailable. Please try again.'), { status: 502 });
  }
  if (!response.ok) {
    throw Object.assign(new Error('The tutor service could not answer. Please try again.'), { status: 502 });
  }
  try {
    const result = await response.json();
    if (result.status !== 'completed' || !Array.isArray(result.output)) throw new Error();
    const content = result.output.flatMap((item) => item.type === 'message' && Array.isArray(item.content) ? item.content : []);
    if (content.some((item) => item.type === 'refusal')) throw new Error();
    const text = content.filter((item) => item.type === 'output_text').map((item) => item.text).join('');
    return validateLesson(JSON.parse(text));
  } catch {
    throw Object.assign(new Error('The tutor returned an invalid lesson. Please try again.'), { status: 502 });
  }
}
function createApp(options = {}) {
  const app = express();
  const historyStore = options.historyStore || createHistoryStore(options.historyFile || path.join(ROOT, 'data/history.json'));
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/history', async (req, res) => {
    try { res.json({ history: await historyStore.readHistory() }); }
    catch { res.status(500).json({ error: 'Unable to read question history.' }); }
  });
  app.post('/api/chat', async (req, res) => {
    const body = req.body;
    if (!body || typeof body.question !== 'string') {
      return res.status(400).json({ error: 'A question string is required.' });
    }
    const question = body.question.trim();
    if (!question) return res.status(400).json({ error: 'Question cannot be empty.' });
    if (question.length > 500) return res.status(400).json({ error: 'Question must be 500 characters or fewer.' });
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'The tutor is not configured. Set OPENAI_API_KEY on the server.' });
    let instructions;
    try {
      instructions = options.instructions ?? await readFile(path.join(ROOT, 'prompts/studybuddy.md'), 'utf8');
      if (!instructions.trim()) throw new Error();
    } catch { return res.status(503).json({ error: 'Tutor teaching instructions are unavailable.' }); }
    let lesson;
    try {
      lesson = await requestLesson({ question, instructions, apiKey,
        model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini', fetchImpl: options.fetchImpl || fetch });
    } catch (error) { return res.status(error.status || 502).json({ error: error.message }); }
    const entry = { id: randomUUID(), question, title: lesson.title, sections: lesson.sections, createdAt: new Date().toISOString() };
    try { await historyStore.saveEntry(entry); }
    catch { return res.status(500).json({ error: 'Unable to save question history. Your lesson was not saved.' }); }
    return res.json(entry);
  });
  app.all('/api/chat', (req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed.' }));
  app.all('/api/history', (req, res) => res.set('Allow', 'GET').status(405).json({ error: 'Method not allowed.' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}
function createServer(options = {}) { return createHttpServer(createApp(options)); }
if (require.main === module) {
  // Load a local .env on the server only; it is outside the public directory.
  try { process.loadEnvFile(path.join(ROOT, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`StudyBuddy listening at http://${host}:${port}`));
}
module.exports = { createApp, createServer, createHistoryStore, requestLesson, validateLesson };
