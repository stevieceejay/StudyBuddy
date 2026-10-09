# StudyBuddy

A small programming tutor using HTML, CSS, vanilla JavaScript, Node.js and
Express. The existing design, question suggestions, Ctrl/Cmd+Enter shortcut,
fresh-question button and saved lesson navigation are preserved.

## Start

Use Node.js 20.12 or newer (tested with Node.js 24).

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` locally and set `OPENAI_API_KEY` to your own API key, then run:

```powershell
npm start
```

Open http://127.0.0.1:3000. Alternatively, supply `OPENAI_API_KEY` through your
server environment. `OPENAI_MODEL` defaults to `gpt-4o-mini`; `PORT` defaults to
3000. The server starts without a key so the page and saved history remain
available, but new tutor requests report a configuration error.

Never commit `.env`. `.gitignore` excludes environment files, dependencies and
generated history. Only `public/` is served to the browser; the key, teaching
prompt and history file stay outside that directory.

## How it works

1. The browser sends `{ "question": "..." }` to `POST /api/chat`.
2. Express checks that the question is a nonempty string, trims surrounding
   whitespace, and enforces the 500-character limit. It reads teaching
   instructions from `prompts/studybuddy.md`.
3. The backend calls the OpenAI Responses API with the server's key and a strict
   JSON schema requiring a programming-scope classification, title and three
   sections. This uses OpenAI's
   [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
4. The server rejects questions classified as outside programming/software
   development with HTTP 422 and does not save them. It independently checks
   every returned field, exact section order
   (`Core idea`, `Example`, `Common pitfall`), nonempty text, size limits and
   unexpected fields. Incomplete responses, refusals and invalid JSON fail.
5. The server creates a UUID and UTC ISO timestamp, then writes the complete
   entry to `data/history.json`. It returns success only after saving. Writes
   are queued and published through a temporary file and rename.
6. The browser displays the lesson using `textContent`; model HTML is shown
   literally. Newlines in examples are preserved. On refresh, it calls
   `GET /api/history` and displays saved lessons again.

New entries have exactly this shape:

```json
{
  "id": "server-generated UUID",
  "question": "Original question after whitespace validation",
  "title": "Lesson title",
  "sections": [
    { "heading": "Core idea", "content": "Explanation" },
    { "heading": "Example", "content": "Small code example" },
    { "heading": "Common pitfall", "content": "Mistake and correction" }
  ],
  "createdAt": "2026-10-08T00:00:00.000Z"
}
```

`GET /api/history` returns `{ "history": [...] }`, newest first. Repeated
questions are separate saved lessons. Existing demo entries in server history
and browser local storage remain readable. Browser demo entries remain in their
original storage; new AI lessons are saved by the backend.

Follow-up questions are allowed by the teaching prompt and can be submitted
using the same form. Each request is an independent lesson; include relevant
context in a follow-up question. There is no multi-turn conversation memory.

## Errors and limits

Empty or invalid questions/JSON receive HTTP 400, unrelated questions receive
HTTP 422, oversized bodies 413, missing configuration 503, OpenAI/network/invalid
lesson errors 502, and history failures 500. Scope classification is performed
by the tutor model, so ambiguous questions may occasionally be misclassified.
Upstream error bodies and secrets are not returned to the browser. OpenAI
requests time out after 30 seconds. The form retains the question on failure.

This class assignment uses a single Node process and one local JSON history
file. Run one server process per history file. All visitors to that server share
the same history. It needs no database, frontend framework or build step.

## Tests

```powershell
npm test
npm run test:live
```

`npm test` uses mocked OpenAI HTTP responses and never calls the live API. It
checks input validation, the actual prompt/schema request, model validation,
metadata, persistence, concurrent writes, storage failures, static file
boundaries, refresh loading, browser error handling and safe text rendering.
Tests use isolated temporary history files, never the real saved history.
Browser tests use a small DOM test double rather than a full browser engine.

`npm run test:live` is separate. It makes one real OpenAI request when a key is
configured and may incur API usage. With no key, it reports a skipped test and
makes no API request. It does not modify saved app history. A passing mocked
test does not establish live account access.
