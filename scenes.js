export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function picture(entry, decorative = false) {
  const img = element('img');
  img.src = entry.image;
  img.alt = decorative ? '' : entry.name;
  img.draggable = false;
  return img;
}

function button(className, label) {
  const node = element('button', className);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  return node;
}

export function storyImageOffset(text, name) {
  const match = text.indexOf(name);
  if (match >= 0) return match;
  const sentence = text.match(/[.!?。！？](?=\s)|\n/);
  if (sentence) return sentence.index + 1;
  const middle = Math.floor(text.length / 2);
  const space = text.indexOf(' ', middle);
  return space < 0 ? text.length : space;
}

export function wordsScene(parent, entries, openStory, makeDeleteButton) {
  const spread = element('div', 'words');
  for (const entry of entries) {
    const article = element('article', 'word-entry');
    const copy = element('p');
    const marker = button('inline-object', entry.name + ' 이야기 열기');
    const img = picture(entry, true);
    img.loading = 'lazy';
    marker.append(img);
    marker.addEventListener('click', () => openStory(entry));

    const index = storyImageOffset(entry.story, entry.name);
    copy.append(entry.story.slice(0, index).trimEnd(), ' ', marker, ' ', entry.story.slice(index).trimStart());
    article.append(element('h3', '', entry.name + ' · ' + entry.duration + (entry.example ? ' · 예시' : '')), copy);
    const deleteButton = makeDeleteButton?.(entry);
    if (deleteButton) article.append(deleteButton);
    spread.append(article);
  }
  parent.append(spread);
}
