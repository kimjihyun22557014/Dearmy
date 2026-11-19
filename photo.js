const MAX_OUTPUT = 220000;
const MODEL_MODULE = 'https://esm.sh/@imgly/background-removal@1.7.0?bundle';

async function canvasFrom(blob, maxSide) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지를 만들 수 없어요.')), type, quality);
  });
}

function rgba(canvas, ctx) {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function hasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 32) return true;
  }
  return false;
}

function removeFlatBackground(pixels) {
  const { data, width, height } = pixels;
  const border = [];
  for (let x = 0; x < width; x += 3) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 3) border.push(y * width, y * width + width - 1);

  const background = [0, 1, 2].map(channel => {
    const values = border.map(index => data[index * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length * .5)];
  });
  function distance(index) {
    const offset = index * 4;
    return Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]);
  }
  if (border.filter(index => distance(index) < 13).length / border.length < .975) return false;

  const size = width * height;
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  let count = 0;
  function add(index) {
    if (visited[index]) return;
    visited[index] = 1;
    if (distance(index) < 38) queue[count++] = index;
  }

  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  for (let i = 0; i < count; i++) {
    const index = queue[i];
    const x = index % width;
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (index >= width) add(index - width);
    if (index + width < size) add(index + width);
  }
  if (count < size * .20 || count > size * .98) return false;
  for (let i = 0; i < count; i++) data[queue[i] * 4 + 3] = 0;

  const { largest, retained } = cleanMask(pixels);
  return largest >= retained * .97 && largest >= (size - count) * .95;
}

function cleanMask({ data, width, height }) {
  const size = width * height;
  const labels = new Int32Array(size);
  const queue = new Int32Array(size);
  const sizes = [0];
  let largest = 0;

  for (let start = 0; start < size; start++) {
    if (labels[start] || data[start * 4 + 3] <= 45) continue;
    const label = sizes.length;
    let end = 0;
    function add(index) {
      if (labels[index] || data[index * 4 + 3] <= 45) return;
      labels[index] = label;
      queue[end++] = index;
    }

    add(start);
    for (let head = 0; head < end; head++) {
      const index = queue[head];
      const x = index % width;
      const left = x > 0 ? -1 : 0;
      const right = x + 1 < width ? 1 : 0;
      for (let dx = left; dx <= right; dx++) {
        if (index >= width) add(index - width + dx);
        if (dx) add(index + dx);
        if (index + width < size) add(index + width + dx);
      }
    }
    sizes.push(end);
    largest = Math.max(largest, end);
  }

  const cutoff = Math.min(largest, Math.max(8, largest * .012));
  let retained = 0;
  for (let index = 0; index < size; index++) {
    const label = labels[index];
    if (!label) continue;
    if (sizes[label] < cutoff) data[index * 4 + 3] = 0;
    else retained++;
  }
  return { largest, retained };
}

async function trimAndEncode(canvas, ctx) {
  const { data, width, height } = rgba(canvas, ctx);
  let left = width, top = height, right = -1, bottom = -1, opaque = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 45) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        opaque++;
      }
    }
  }
  if (opaque < width * height * .007 || opaque > width * height * .995) {
    throw new Error('물건의 윤곽을 찾지 못했어요. 물건 하나를 단색 배경에서 다시 찍어주세요.');
  }
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const result = document.createElement('canvas');
  for (const maxSide of [640, 480, 320, 200]) {
    const scale = Math.min(1, maxSide / Math.max(cropWidth, cropHeight));
    result.width = Math.max(1, Math.round(cropWidth * scale));
    result.height = Math.max(1, Math.round(cropHeight * scale));
    result.getContext('2d').drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, result.width, result.height);
    const blob = await encode(result, 'image/webp', .86);
    if (blob.size <= MAX_OUTPUT) return blob;
  }
  throw new Error('이미지 용량이 커요. 다른 사진을 선택해주세요.');
}

function deadline(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('모델 응답 시간 초과')), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function makeCutout(file, onProgress, { forceModel = false, detailed = false } = {}) {
  let source;
  try {
    source = await canvasFrom(file, 896);
  } catch {
    throw new Error('이 사진 형식을 열 수 없어요. 사진을 JPG 또는 PNG로 저장한 뒤 다시 올려주세요.');
  }
  const { canvas, ctx } = source;
  const pixels = rgba(canvas, ctx);
  if (hasTransparency(pixels.data)) return { blob: await trimAndEncode(canvas, ctx), method: 'transparent' };
  if (!forceModel && removeFlatBackground(pixels)) {
    const fast = document.createElement('canvas');
    fast.width = canvas.width;
    fast.height = canvas.height;
    const fastCtx = fast.getContext('2d', { willReadFrequently: true });
    fastCtx.putImageData(pixels, 0, 0);
    try {
      return { blob: await trimAndEncode(fast, fastCtx), method: 'flat' };
    } catch {
      // The color-based mask can remove too much of a small object.
    }
  }

  onProgress(detailed
    ? '더 정밀하게 물건의 윤곽을 찾는 중이에요.'
    : '물건의 윤곽을 분석하는 중이에요. 처음에는 시간이 걸릴 수 있어요.');
  let result;
  try {
    const input = await encode(canvas, 'image/png');
    result = await deadline((async () => {
      const { removeBackground } = await import(MODEL_MODULE);
      return removeBackground(input, { model: detailed ? 'medium' : 'small', output: { format: 'image/png' } });
    })(), detailed ? 120000 : 90000);
  } catch {
    throw new Error('배경 제거 모델을 불러오지 못했어요. 다시 시도하거나 단색 배경에서 찍은 사진을 올려주세요.');
  }
  const cut = await canvasFrom(result, 896);
  const mask = rgba(cut.canvas, cut.ctx);
  cleanMask(mask);
  cut.ctx.putImageData(mask, 0, 0);
  return { blob: await trimAndEncode(cut.canvas, cut.ctx), method: detailed ? 'detailed' : 'model' };
}

export function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
