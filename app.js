import { config } from './config.js';
import { makeCutout, toDataUrl } from './photo.js';
import { loadEntries, saveEntry, shared, invalidConfig } from './store.js';
import { element, pileScene, archiveScene, wordsScene, bagScene } from './scenes.js';

const examples = [
  ['camera', '필름 카메라', '3년', '주말에 집을 나설 때 필름 카메라를 챙겨요. 같은 길도 한 장 남길 만한 장면이 있는지 천천히 보게 됐어요.'],
  ['bear', '곰 인형', '12년', '잠들기 전에 곰 인형을 꼭 옆에 둬요. 오래 안고 다녀서 한쪽 귀가 접혀 있는데 그 모양이 제일 익숙해요.'],
  ['headphones', '빨간 헤드폰', '2년', '등굣길에 지하철을 타면 빨간 헤드폰을 꺼내요. 예전에는 도착 시간만 봤는데 요즘은 팟캐스트 한 편을 다 듣고 내려요.'],
  ['notebook', '파란 수첩', '8개월', '작업하다 떠오른 말이나 그림을 파란 수첩에 적어요. 책상을 비우고 나서도 뭘 생각하고 있었는지 다시 찾을 수 있어 좋아요.'],
  ['keys', '열쇠고리', '4년', '집을 나서면서 주머니 속 열쇠고리를 한 번 만져봐요. 보라색 장식이 손끝에 닿으면 열쇠를 챙겼다는 걸 바로 알아요.'],
  ['mug', '노란 머그컵', '5년', '아침에 노란 머그컵에 따뜻한 물을 따라요. 손잡이에 손가락 두 개가 꼭 맞아서 다른 컵이 있어도 이걸 먼저 집게 돼요.'],
].map(([id, name, duration, story]) => ({ id: 'example-' + id, image: './assets/' + id + '.png', name, duration, story, example: true }));

const views = {
  pile: { title: '쏟아진 물건', action: '다시 떨어뜨리기', hint: '클릭하면 움직이고, 더블클릭하면 이야기가 열려요.' },
  archive: { title: '전체 기록', hint: '물건을 선택하면 사진과 이야기를 읽을 수 있어요.' },
  words: { title: '문장 속 물건', hint: '이야기 사이에 놓인 물건을 찾아보세요.' },
  bag: { title: '가방 속 물건', action: '다른 물건 담기', hint: '물건을 끌어 꺼내고, 더블클릭해서 이야기를 열어보세요.' },
};

const get = id => document.getElementById(id);
const scene = get('scene');
const action = get('view-action');
const storyDialog = get('story');
const uploadDialog = get('upload');
const form = get('upload-form');
const photo = get('photo');
const retryPhoto = get('retry-photo');
const publish = get('publish');
const processing = get('processing');
const original = get('original');
const cutout = get('cutout');
const formError = get('form-error');
const notice = get('notice');

let records = [];
let pile, bagOffset = 0, latestId;
let selectedImage, originalUrl, cutoutUrl, requestVersion = 0, entryId;
let saving = false, preparingPhoto = false;

function currentView() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(views, hash) ? hash : 'pile';
}

function openStory(entry) {
  get('story-image').src = entry.image;
  get('story-image').alt = entry.name;
  get('story-title').textContent = entry.name;
  get('story-meta').textContent = entry.duration + ' 함께한 물건' + (entry.example ? ' · 예시 기록' : '');
  get('story-text').textContent = entry.story;
  storyDialog.showModal();
}

function allEntries() {
  return config.showExamples ? [...records, ...examples] : records;
}

function render() {
  const view = currentView();
  const entries = allEntries();
  pile?.dispose();
  pile = undefined;
  scene.replaceChildren();
  for (const tab of document.querySelectorAll('[data-view]')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  get('view-title').textContent = views[view].title;
  const usingTouch = matchMedia('(pointer: coarse)').matches;
  const touchHints = { pile: '물건을 탭해서 움직이고, 이야기 보기 버튼을 눌러 글을 읽어보세요.', bag: '물건을 끌어 꺼내고, 이야기 보기 버튼을 눌러 글을 읽어보세요.' };
  get('hint').textContent = (usingTouch && touchHints[view]) || views[view].hint;
  get('count').textContent = '등록 ' + records.length + '개' + (config.showExamples ? ' · 예시 ' + examples.length + '개' : '');
  action.textContent = views[view].action || '';
  action.hidden = !entries.length || !views[view].action || (view === 'bag' && entries.length < 6);

  if (!entries.length) {
    scene.append(element('p', 'empty', '아직 등록된 물건이 없어요. 물건 하나를 처음으로 올려보세요.'));
    return;
  }
  switch (view) {
    case 'pile': pile = pileScene(scene, entries, openStory, latestId); latestId = undefined; break;
    case 'archive': archiveScene(scene, entries, openStory); break;
    case 'words': wordsScene(scene, entries, openStory); break;
    case 'bag': bagScene(scene, entries, openStory, bagOffset); break;
  }
}

function switchView() {
  render();
  if (currentView() === 'words') get('view-title').scrollIntoView({ block: 'nearest' });
}

window.addEventListener('hashchange', switchView);
action.addEventListener('click', () => {
  if (currentView() === 'pile') pile?.reset();
  if (currentView() === 'bag') {
    bagOffset = (bagOffset + 5) % allEntries().length;
    render();
  }
});

function clearPhoto() {
  requestVersion++;
  selectedImage = undefined;
  preparingPhoto = false;
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
  originalUrl = cutoutUrl = undefined;
  original.removeAttribute('src');
  cutout.removeAttribute('src');
  original.closest('.previews').hidden = true;
  cutout.hidden = true;
  retryPhoto.hidden = true;
  processing.textContent = '';
  formError.textContent = '';
  publish.disabled = true;
}

async function preparePhoto() {
  clearPhoto();
  const file = photo.files[0];
  if (!file) return;
  const version = requestVersion;
  if (file.size > 15 * 1024 * 1024) {
    formError.textContent = '15MB 이하의 사진을 올려주세요.';
    return;
  }

  preparingPhoto = true;
  originalUrl = URL.createObjectURL(file);
  original.src = originalUrl;
  original.closest('.previews').hidden = false;
  processing.textContent = '사진에서 물건을 찾는 중이에요.';
  try {
    const { blob } = await makeCutout(file, message => {
      if (requestVersion === version) processing.textContent = message;
    });
    if (requestVersion !== version) return;
    selectedImage = blob;
    cutoutUrl = URL.createObjectURL(blob);
    cutout.src = cutoutUrl;
    cutout.hidden = false;
    processing.textContent = '배경 제거가 끝났어요. 윤곽을 확인해보세요.';
    publish.disabled = invalidConfig;
  } catch (error) {
    if (requestVersion !== version) return;
    processing.textContent = error.message || '배경을 지우는 중에 문제가 생겼어요.';
    retryPhoto.hidden = false;
  } finally {
    if (requestVersion === version) preparingPhoto = false;
  }
}

photo.addEventListener('change', preparePhoto);
retryPhoto.addEventListener('click', preparePhoto);
get('storage-note').textContent = invalidConfig
  ? '공동 아카이브 설정을 확인해주세요.'
  : (shared ? '사진과 이야기가 공개 아카이브에 올라가요.' : '시연 모드에서는 이 브라우저에만 기록이 저장돼요.');
get('add').addEventListener('click', () => {
  entryId = crypto.randomUUID();
  uploadDialog.showModal();
});
for (const node of document.querySelectorAll('[data-close]')) {
  node.addEventListener('click', () => {
    if (!saving || node.closest('dialog') !== uploadDialog) node.closest('dialog').close();
  });
}
uploadDialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
uploadDialog.addEventListener('close', () => {
  form.reset();
  clearPhoto();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || preparingPhoto || !selectedImage) return;
  const fields = new FormData(form);
  const name = fields.get('name').trim();
  const duration = fields.get('duration').trim();
  const story = fields.get('story').trim();
  if (!name || !duration || !story) {
    formError.textContent = '물건의 이름, 함께한 시간, 이야기를 입력해주세요.';
    return;
  }

  saving = true;
  for (const control of form.querySelectorAll('input, textarea, button')) control.disabled = true;
  formError.textContent = '';
  try {
    const entry = { id: entryId, name, duration, story, image: await toDataUrl(selectedImage) };
    await saveEntry(entry);
    records = [entry, ...records.filter(record => record.id !== entry.id)];
    latestId = entry.id;
    notice.textContent = shared ? '물건을 공동 아카이브에 올렸어요.' : '물건을 이 브라우저에 저장했어요.';
    uploadDialog.close();
    if (currentView() !== 'pile') location.hash = 'pile';
    else render();
    get('view-title').scrollIntoView({ block: 'nearest' });
  } catch (error) {
    formError.textContent = error.name === 'QuotaExceededError'
      ? '브라우저 저장 공간이 가득 찼어요.'
      : '등록하지 못했어요. 연결 또는 저장 설정을 확인한 뒤 다시 시도해주세요.';
  } finally {
    saving = false;
    for (const control of form.querySelectorAll('input, textarea, button')) control.disabled = false;
    publish.disabled = !selectedImage || invalidConfig;
  }
});

render();
try {
  records = await loadEntries();
  if (records.length) render();
  if (invalidConfig) notice.textContent = '공동 아카이브 설정을 확인해주세요.';
} catch {
  notice.textContent = '저장된 기록을 불러오지 못했어요. 페이지를 새로고침해주세요.';
}
