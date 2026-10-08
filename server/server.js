const { createServer: createHttpServer } = require('node:http');
const { mkdir, open, readFile, rename, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const HISTORY_FILE = path.resolve(__dirname, '..', 'data', 'history.json');
const MAX_BODY_SIZE = 16 * 1024;
const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY = 30;

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

function matchesKeyword(question, keyword) {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedKeyword}\\b`).test(question);
}

function getLesson(question) {
  const normalized = question.toLocaleLowerCase();
  const lesson = demoLessons.find((candidate) =>
    candidate.matches.some((match) => matchesKeyword(normalized, match))
  );

  return lesson || {
    title: 'A starting point for your coding question',
    paragraphs: [
      `You asked: “${question}”`,
      'This is a prepared demo response rather than an AI-generated answer. To explore a programming topic, identify the key concept, trace a small example, and notice how the output changes when you change one part.',
      'Try narrowing your question to a language feature, tool, or error message for a more focused starting point.'
    ]
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function createHistoryStore(filePath) {
  let writeQueue = Promise.resolve();
  const initialized = (async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      const handle = await open(filePath, 'wx');
      await handle.writeFile('[]\n');
      await handle.close();
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  })();

  async function readHistory() {
    await initialized;
    await writeQueue;
    const contents = await readFile(filePath, 'utf8');
    const history = JSON.parse(contents);
    if (!Array.isArray(history)) {
      throw new Error('History data must be a JSON array.');
    }
    return history;
  }

  function saveEntry(entry) {
    const operation = writeQueue.then(async () => {
      await initialized;
      const contents = await readFile(filePath, 'utf8');
      const history = JSON.parse(contents);
      if (!Array.isArray(history)) {
        throw new Error('History data must be a JSON array.');
      }
      const updatedHistory = [
        entry,
        ...history.filter((saved) => saved.question !== entry.question)
      ].slice(0, MAX_HISTORY);
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(updatedHistory, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, filePath);
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return { readHistory, saveEntry };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (size > MAX_BODY_SIZE) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });

    request.on('error', reject);
  });
}

async function serveStaticFile(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: 'Invalid URL path.' });
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }

    const contents = await readFile(filePath);
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': contents.length
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    console.error('Failed to serve static file:', error);
    sendJson(response, 500, { error: 'Unable to serve file.' });
  }
}

function createServer(options = {}) {
  const historyStore = createHistoryStore(options.historyFile || HISTORY_FILE);

  return createHttpServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL.' });
      return;
    }

    if (url.pathname === '/api/history') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }
      try {
        sendJson(response, 200, { history: await historyStore.readHistory() });
      } catch (error) {
        console.error('Failed to read question history:', error);
        sendJson(response, 500, { error: 'Unable to read question history.' });
      }
      return;
    }

    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      if (!body || typeof body.question !== 'string') {
        sendJson(response, 400, { error: 'A question string is required.' });
        return;
      }

      const question = body.question.trim();
      if (!question) {
        sendJson(response, 400, { error: 'Question cannot be empty.' });
        return;
      }
      if (question.length > MAX_QUESTION_LENGTH) {
        sendJson(response, 400, { error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.` });
        return;
      }

      const lesson = getLesson(question);
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question,
        ...lesson,
        createdAt: new Date().toISOString()
      };
      try {
        await historyStore.saveEntry(entry);
      } catch (error) {
        console.error('Failed to save question history:', error);
        sendJson(response, 500, { error: 'Unable to save question history.' });
        return;
      }
      sendJson(response, 200, entry);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API endpoint not found.' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    await serveStaticFile(request, response, url.pathname === '/' ? '/index.html' : url.pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    console.log(`Studybudy listening at http://${host}:${port}`);
  });
}

module.exports = { createServer, getLesson };
