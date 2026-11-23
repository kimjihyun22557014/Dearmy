import { config } from './config.js';
import { makeCutout, prepareImageFile, toDataUrl } from './photo.js?v=heic-upload';
import { loadEntries, saveEntry, deleteLocalEntry, shared, invalidConfig } from './store.js?v=delete-record';
import { element, wordsScene } from './scenes.js?v=single-archive';

const examples = [
  ['camera', '필름 카메라', '3년', '주말에 집을 나설 때 필름 카메라를 챙겨요. 같은 길도 한 장 남길 만한 장면이 있는지 천천히 보게 됐어요.'],
  ['bear', '곰 인형', '12년', '잠들기 전에 곰 인형을 꼭 옆에 둬요. 오래 안고 다녀서 한쪽 귀가 접혀 있는데 그 모양이 제일 익숙해요.'],
  ['headphones', '빨간 헤드폰', '2년', '등굣길에 지하철을 타면 빨간 헤드폰을 꺼내요. 예전에는 도착 시간만 봤는데 요즘은 팟캐스트 한 편을 다 듣고 내려요.'],
  ['notebook', '파란 수첩', '8개월', '작업하다 떠오른 말이나 그림을 파란 수첩에 적어요. 책상을 비우고 나서도 뭘 생각하고 있었는지 다시 찾을 수 있어 좋아요.'],
  ['keys', '열쇠고리', '4년', '집을 나서면서 주머니 속 열쇠고리를 한 번 만져봐요. 보라색 장식이 손끝에 닿으면 열쇠를 챙겼다는 걸 바로 알아요.'],
  ['mug', '노란 머그컵', '5년', '아침에 노란 머그컵에 따뜻한 물을 따라요. 손잡이에 손가락 두 개가 꼭 맞아서 다른 컵이 있어도 이걸 먼저 집게 돼요.'],
].map(([id, name, duration, story]) => ({ id: 'example-' + id, image: './assets/' + id + '.png', name, duration, story, example: true }));

const ENTRIES_PER_PAGE = 10;

const get = id => document.getElementById(id);
const scene = get('scene');
const pagination = get('pagination');
const previousPage = get('previous-page');
const nextPage = get('next-page');
const pageNumber = get('page-number');
const storyDialog = get('story');
const storyActions = get('story-actions');
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
let page = 1;
let selectedImage, preparedPhoto, originalUrl, cutoutUrl, requestVersion = 0, entryId;
let saving = false, preparingPhoto = false;

function makeDeleteButton(entry) {
  if (shared || entry.example || !records.some(record => record.id === entry.id)) return null;
  const control = element('button', 'delete-record');
  control.type = 'button';
  control.setAttribute('aria-label', entry.name + ' 기록 삭제');
  control.title = '기록 삭제';
  control.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>';
  control.addEventListener('click', () => {
    if (!window.confirm('‘' + entry.name + '’ 기록을 삭제할까요?')) return;
    try {
      records = deleteLocalEntry(entry.id);
    } catch {
      window.alert('기록을 삭제하지 못했어요. 다시 시도해주세요.');
      return;
    }
    if (storyDialog.open) storyDialog.close();
    render();
    scene.focus({ preventScroll: true });
    notice.textContent = '기록을 삭제했어요.';
  });
  return control;
}

function openStory(entry) {
  get('story-image').src = entry.image;
  get('story-image').alt = entry.name;
  get('story-title').textContent = entry.name;
  get('story-meta').textContent = entry.duration + ' 함께한 물건' + (entry.example ? ' · 예시 기록' : '');
  get('story-text').textContent = entry.story;
  const deleteButton = makeDeleteButton(entry);
  storyActions.replaceChildren();
  if (deleteButton) storyActions.append(deleteButton);
  storyActions.hidden = !deleteButton;
  storyDialog.showModal();
}

function render() {
  const entries = config.showExamples ? [...records, ...examples] : records;
  const totalPages = Math.max(1, Math.ceil(entries.length / ENTRIES_PER_PAGE));
  page = Math.min(Math.max(page, 1), totalPages);
  const start = (page - 1) * ENTRIES_PER_PAGE;

  scene.replaceChildren();
  if (entries.length) {
    wordsScene(scene, entries.slice(start, start + ENTRIES_PER_PAGE), openStory, makeDeleteButton);
  } else {
    scene.append(element('p', 'empty', '아직 등록된 물건이 없어요. 첫 물건을 올려보세요.'));
  }
  pagination.hidden = totalPages === 1;
  previousPage.disabled = page === 1;
  nextPage.disabled = page === totalPages;
  pageNumber.textContent = page + ' / ' + totalPages;
}

function goToPage(number) {
  page = number;
  render();
  scene.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

previousPage.addEventListener('click', () => goToPage(page - 1));
nextPage.addEventListener('click', () => goToPage(page + 1));

function clearPhoto() {
  requestVersion++;
  selectedImage = preparedPhoto = undefined;
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

let cutoutMethod;

async function preparePhoto({ retry = false } = {}) {
  if (retry && (preparingPhoto || saving)) return;
  if (!retry) {
    clearPhoto();
    cutoutMethod = undefined;
  }
  const file = photo.files[0];
  if (!file) return;
  const version = ++requestVersion;
  if (file.size > 15 * 1024 * 1024) {
    formError.textContent = '15MB 이하의 사진을 올려주세요.';
    return;
  }

  preparingPhoto = true;
  retryPhoto.hidden = true;
  publish.disabled = true;
  const showProgress = message => {
    if (requestVersion === version) processing.textContent = message;
  };
  showProgress('사진을 읽는 중이에요.');
  try {
    if (!preparedPhoto) {
      const decoded = await prepareImageFile(file, showProgress);
      if (requestVersion !== version) return;
      preparedPhoto = decoded;
      originalUrl = URL.createObjectURL(decoded);
      original.src = originalUrl;
      original.closest('.previews').hidden = false;
    }
    showProgress('사진에서 물건을 찾는 중이에요.');
    const { blob, method } = await makeCutout(preparedPhoto, showProgress, {
      forceModel: retry,
      detailed: retry && cutoutMethod === 'model',
    });
    if (requestVersion !== version) return;
    selectedImage = blob;
    cutoutMethod = method;
    if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
    cutoutUrl = URL.createObjectURL(blob);
    cutout.src = cutoutUrl;
    cutout.hidden = false;
    processing.textContent = '배경 제거가 끝났어요. 윤곽을 확인해보세요.';
    retryPhoto.textContent = '배경 제거 다시 하기';
    retryPhoto.hidden = method === 'transparent' || method === 'detailed';
  } catch (error) {
    if (requestVersion !== version) return;
    processing.textContent = error.message || '배경을 지우는 중에 문제가 생겼어요.';
    if (selectedImage) processing.textContent += ' 이전 미리보기는 그대로 사용할 수 있어요.';
    retryPhoto.textContent = preparedPhoto ? '배경 제거 다시 시도' : '사진 다시 불러오기';
    retryPhoto.hidden = false;
  } finally {
    if (requestVersion === version) {
      preparingPhoto = false;
      publish.disabled = !selectedImage || invalidConfig;
    }
  }
}

photo.addEventListener('change', () => preparePhoto());
retryPhoto.addEventListener('click', () => preparePhoto({ retry: true }));
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
  const story = fields.getAll('answer')
    .map(answer => answer.trim())
    .filter(Boolean)
    .join('\n\n');
  if (!name || !duration) {
    formError.textContent = '물건의 이름과 함께한 시간을 입력해주세요.';
    return;
  }
  if (!story) {
    formError.textContent = '질문에 하나 이상 답해주세요.';
    return;
  }

  saving = true;
  for (const control of form.querySelectorAll('input, textarea, button')) control.disabled = true;
  formError.textContent = '';
  try {
    const entry = { id: entryId, name, duration, story, image: await toDataUrl(selectedImage) };
    await saveEntry(entry);
    records = [entry, ...records.filter(record => record.id !== entry.id)];
    notice.textContent = shared ? '물건을 공동 아카이브에 올렸어요.' : '물건을 이 브라우저에 저장했어요.';
    uploadDialog.close();
    goToPage(1);
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
