// Model strings are always text nodes, never HTML or Markdown interpreted as HTML.
export function buildLesson(document, entry) {
  const question = document.createElement('p');
  question.className = 'answer-question';
  question.textContent = entry.question;
  const title = document.createElement('h3');
  title.className = 'lesson-title';
  title.textContent = entry.title;
  const copy = document.createElement('div');
  copy.className = 'answer-copy';
  if (Array.isArray(entry.sections)) {
    entry.sections.forEach((section) => {
      const heading = document.createElement('h4');
      heading.textContent = section.heading;
      const content = document.createElement('p');
      content.className = 'lesson-content';
      content.textContent = section.content;
      copy.append(heading, content);
    });
  } else if (Array.isArray(entry.paragraphs)) {
    entry.paragraphs.forEach((text) => {
      const content = document.createElement('p');
      content.textContent = text;
      copy.append(content);
    });
  }
  const meta = document.createElement('div');
  meta.className = 'answer-meta';
  meta.textContent = entry.sections ? 'AI-generated lesson · saved on this server' : 'Earlier prepared demo lesson';
  return [question, title, copy, meta];
}
