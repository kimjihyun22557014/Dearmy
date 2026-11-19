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

function touchControl(parent, openStory) {
  const control = button('touch-story');
  control.textContent = '이야기 보기 ↗';
  control.hidden = true;
  let selected;
  control.addEventListener('click', () => openStory(selected));
  parent.append(control);
  return entry => {
    selected = entry;
    control.hidden = false;
  };
}

function objectButton(entry, openStory, onPointer, selectTouch) {
  const node = button('object', entry.name + ' 이야기 보기');
  node.append(picture(entry, true));
  let pendingClick;
  node.addEventListener('click', event => {
    if (event.detail === 0) {
      openStory(entry);
      return;
    }
    if (event.pointerType === 'touch' || node.dataset.touch === 'true') selectTouch(entry);
    if (event.detail === 1 && onPointer) {
      clearTimeout(pendingClick);
      pendingClick = setTimeout(() => { if (node.isConnected) onPointer(); }, 300);
    }
  });
  node.addEventListener('pointerdown', event => {
    node.dataset.touch = String(event.pointerType === 'touch');
  });
  node.addEventListener('dblclick', event => {
    clearTimeout(pendingClick);
    if (node.dataset.touch === 'true') return;
    if (node.dataset.dragged === 'true') return;
    event.preventDefault();
    openStory(entry);
  });
  return node;
}

export function pileScene(parent, entries, openStory, highlightedId) {
  const scene = element('div', 'pile');
  const layer = element('div', 'objects');
  scene.append(layer);
  const selectTouch = touchControl(scene, openStory);
  parent.append(scene);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const listed = entries.slice(0, 16);
  const highlighted = listed.find(entry => entry.id === highlightedId);
  const ordered = highlighted ? [...listed.filter(entry => entry !== highlighted), highlighted] : listed;
  const bodies = ordered.map((entry, index) => {
    const body = { entry, index, x: 0, y: 0, vx: 0, vy: 0, spin: 0, rotation: 0, radius: 0 };
    body.node = objectButton(entry, openStory, () => {
      if (reducedMotion) return;
      body.vy = -10;
      body.vx += body.x < width / 2 ? 3.2 : -3.2;
      body.spin += 4;
      body.node.style.zIndex = '5';
      idleFrames = 0;
      wakeUp();
    }, selectTouch);
    layer.append(body.node);
    return body;
  });

  let width = 0, height = 0, frame = 0, idleFrames = 0, lastTime = 0, accumulated = 0;
  function wakeUp() {
    if (!frame && bodies.length) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function initialize() {
    width = scene.clientWidth;
    height = scene.clientHeight;
    const lanes = Math.min(bodies.length, width < 600 ? 5 : 10);
    const radius = Math.max(24, Math.min(128, width / ((lanes + 1) * 2.15), height * .27));
    const inset = Math.max(radius * 1.28, width * .075);
    for (const body of bodies) {
      const laneIndex = body.index % lanes;
      const lane = laneIndex % 2 ? lanes - 1 - Math.floor(laneIndex / 2) : Math.floor(laneIndex / 2);
      const fraction = lanes > 1 ? lane / (lanes - 1) : .5;
      body.radius = radius * (.82 + (body.index % 4) * .09);
      body.x = inset + fraction * (width - 2 * inset);
      body.y = -body.radius - body.index * Math.min(35, height * .07);
      body.vx = (body.index % 3 - 1) * .8;
      body.vy = 0;
      body.spin = 0;
      body.rotation = (body.index % 5 - 2) * 8;
      body.node.style.width = body.node.style.height = body.radius * 2.2 + 'px';
      body.node.style.zIndex = '';
    }
    idleFrames = 0;
    accumulated = 0;
    if (reducedMotion) {
      for (let step = 0; step < 170; step++) simulate();
      draw();
    } else {
      draw();
      wakeUp();
    }
  }

  function keepInside(body) {
    const floor = height - body.radius * 1.25 - 9;
    if (body.y > floor) {
      body.y = floor;
      body.vy = body.vy > 1.35 ? -body.vy * .38 : 0;
      body.vx *= .83;
      body.spin *= .72;
    }
    if (body.x < body.radius || body.x > width - body.radius) {
      body.x = Math.max(body.radius, Math.min(width - body.radius, body.x));
      body.vx *= -.59;
    }
  }

  function simulate() {
    for (const body of bodies) {
      body.vy = Math.min(23, body.vy + .44);
      body.x += body.vx;
      body.y += body.vy;
      body.rotation += body.spin + body.vx * .28;
      body.spin *= .95;
      keepInside(body);
    }
    for (let a = 0; a < bodies.length; a++) {
      const first = bodies[a];
      for (let b = a + 1; b < bodies.length; b++) {
        const second = bodies[b];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const overlap = (first.radius + second.radius) * .90 - distance;
        if (distance < .01 || overlap <= 0) continue;
        const x = dx / distance;
        const y = dy / distance;
        first.x -= x * overlap * .5;
        first.y -= y * overlap * .5;
        second.x += x * overlap * .5;
        second.y += y * overlap * .5;
        const approach = (first.vx - second.vx) * x + (first.vy - second.vy) * y;
        if (approach > 0) {
          const impulse = approach * .62;
          first.vx -= x * impulse;
          first.vy -= y * impulse;
          second.vx += x * impulse;
          second.vy += y * impulse;
        }
      }
    }
    for (const body of bodies) keepInside(body);
  }

  function draw() {
    for (const body of bodies) {
      body.node.style.transform = 'translate(' + (body.x - body.radius * 1.1) + 'px,' + (body.y - body.radius * 1.1) + 'px) rotate(' + body.rotation + 'deg)';
    }
  }

  function tick(time) {
    frame = 0;
    accumulated += lastTime ? Math.min(40, time - lastTime) : 1000 / 60;
    lastTime = time;
    while (accumulated >= 1000 / 60) {
      simulate();
      accumulated -= 1000 / 60;
    }
    draw();
    const moving = bodies.some(body => body.y < 0 || Math.abs(body.vx) + Math.abs(body.vy) > .9);
    idleFrames = moving ? 0 : idleFrames + 1;
    if (idleFrames < 30) frame = requestAnimationFrame(tick);
  }

  initialize();
  const observer = new ResizeObserver(() => {
    if (scene.clientWidth !== width || scene.clientHeight !== height) initialize();
  });
  observer.observe(scene);
  return { reset: initialize, dispose() { cancelAnimationFrame(frame); observer.disconnect(); } };
}

export function archiveScene(parent, entries, openStory) {
  const grid = element('div', 'archive-grid');
  for (const entry of entries) {
    const card = button('record');
    const img = picture(entry, true);
    img.loading = 'lazy';
    card.append(img, element('strong', '', entry.name),
      element('span', 'meta', entry.duration + (entry.example ? ' · 예시 기록' : '')),
      element('span', 'record-preview', entry.story));
    card.addEventListener('click', () => openStory(entry));
    grid.append(card);
  }
  parent.append(grid);
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

const bagSlots = [[29, 47], [47, 38], [66, 45], [40, 64], [59, 63]];

export function bagScene(parent, entries, openStory, offset = 0) {
  const scene = element('div', 'bag');
  const layer = element('div', 'objects');
  scene.append(element('div', 'bag-shell'), layer, element('div', 'bag-front'));
  const selectTouch = touchControl(scene, openStory);
  parent.append(scene);

  const length = Math.min(entries.length, bagSlots.length);
  function setPosition(node, x, y, rotation) {
    node.style.left = x + '%';
    node.style.top = y + '%';
    node.style.transform = 'translate(-50%, -50%) rotate(' + rotation + 'deg)';
  }

  for (let index = 0; index < length; index++) {
    const entry = entries[(index + offset) % entries.length];
    const [startX, startY] = bagSlots[index];
    const rotation = [-12, 11, -10, 17, 4][index];
    const node = objectButton(entry, openStory, null, selectTouch);
    let x = startX, y = startY, drag;
    setPosition(node, x, y, rotation);

    node.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0) return;
      node.dataset.dragged = 'false';
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, moved: false };
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      node.dataset.dragged = 'true';
      const edge = node.offsetWidth / 2;
      const boundX = Math.min(18, edge / scene.clientWidth * 100);
      const boundY = Math.min(20, edge / scene.clientHeight * 100);
      x = Math.max(boundX, Math.min(100 - boundX, drag.x + dx / scene.clientWidth * 100));
      y = Math.max(boundY, Math.min(100 - boundY, drag.y + dy / scene.clientHeight * 100));
      node.classList.add('dragging');
      const outside = x < (scene.clientWidth < 500 ? 10 : 16) || x > (scene.clientWidth < 500 ? 90 : 84) || y < 26 || y > 80;
      node.classList.toggle('out', outside);
      setPosition(node, x, y, outside ? 0 : rotation);
    });
    function release(event) {
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved && event.pointerType === 'touch') selectTouch(entry);
      node.classList.remove('dragging');
      drag = null;
    }
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('lostpointercapture', release);
    layer.append(node);
  }
}
