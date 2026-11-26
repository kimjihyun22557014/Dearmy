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

const heartColors = ['#db243b', '#e97019', '#d99a00', '#16864a', '#2875dd', '#36379a', '#873fb1'];
const repeatTapWindow = 330;

function floatHeart(marker) {
  const box = marker.getBoundingClientRect();
  const heart = element('span', 'object-heart', '♥\uFE0E');
  heart.setAttribute('aria-hidden', 'true');
  heart.style.left = `${box.left + box.width / 2}px`;
  heart.style.top = `${box.top + box.height / 2}px`;
  heart.style.color = heartColors[Math.floor(Math.random() * heartColors.length)];
  document.body.append(heart);

  const drift = Math.random() * 32 - 16;
  const lift = 26 + Math.random() * 17;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = heart.animate(
    reducedMotion ? [{ opacity: 1 }, { opacity: 0 }] : [
      { transform: 'translate(-50%, -50%) scale(.55)', opacity: 0 },
      { offset: .22, transform: `translate(calc(-50% + ${drift * .2}px), calc(-50% - 7px)) scale(1)`, opacity: 1 },
      { offset: .65, opacity: .9 },
      { transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${lift}px)) scale(.85)`, opacity: 0 },
    ],
    { duration: reducedMotion ? 220 : 650, easing: 'ease-out' },
  );
  animation.finished.then(() => heart.remove(), () => heart.remove());
}

export function wordsScene(parent, entries, openStory, makeDeleteButton) {
  const spread = element('div', 'words');
  let storyTimer, lastMarker, lastTap = -Infinity, inBurst = false;
  for (const entry of entries) {
    const article = element('article', 'word-entry');
    const copy = element('p');
    const marker = button('inline-object', entry.name + ' 이야기 열기');
    const img = picture(entry, true);
    img.loading = 'lazy';
    marker.append(img);
    marker.addEventListener('click', event => {
      clearTimeout(storyTimer);
      if (event.detail === 0) {
        lastMarker = undefined;
        openStory(entry);
        return;
      }

      const now = performance.now();
      if (lastMarker === marker && now - lastTap <= repeatTapWindow) {
        if (!inBurst) floatHeart(marker);
        floatHeart(marker);
        inBurst = true;
      } else {
        inBurst = false;
        storyTimer = setTimeout(() => {
          lastMarker = undefined;
          if (marker.isConnected) openStory(entry);
        }, repeatTapWindow);
      }
      lastMarker = marker;
      lastTap = now;
    });

    const index = storyImageOffset(entry.story, entry.name);
    copy.append(entry.story.slice(0, index).trimEnd(), ' ', marker, ' ', entry.story.slice(index).trimStart());
    article.append(element('h3', '', entry.name + ' · ' + entry.duration + (entry.example ? ' · 예시' : '')), copy);
    const deleteButton = makeDeleteButton?.(entry);
    if (deleteButton) article.append(deleteButton);
    spread.append(article);
  }
  parent.append(spread);
}
