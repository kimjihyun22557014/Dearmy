import { config } from './config.js';

export const shared = Boolean(config.supabaseUrl && config.publishableKey);
export const invalidConfig = Boolean(config.supabaseUrl) !== Boolean(config.publishableKey)
  || (shared && !config.publishableKey.startsWith('sb_publishable_'));

const storageKey = 'dear-my-archive-records-v1';

const ownerTokenKey = id => 'dear-my-entry-owner:' + id;

function readOwnerToken(id) {
  try {
    return localStorage.getItem(ownerTokenKey(id));
  } catch {
    return null;
  }
}

export function canManageEntry(entry) {
  return !entry.example && (!shared || Boolean(readOwnerToken(entry.id)));
}

function readLocalEntries() {
  return JSON.parse(localStorage.getItem(storageKey) || '[]');
}

export async function manageEntry(entry, removeEntry = false) {
  if (!canManageEntry(entry)) throw new Error('이 기록을 관리할 권한이 없어요.');
  if (!shared) {
    const records = readLocalEntries();
    if (!records.some(record => record.id === entry.id)) throw new Error('기록을 찾을 수 없어요.');
    const updated = removeEntry
      ? records.filter(record => record.id !== entry.id)
      : records.map(record => record.id === entry.id ? entry : record);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return;
  }

  const args = {
    entry_id: entry.id,
    owner_token: readOwnerToken(entry.id),
    remove_entry: removeEntry,
  };
  if (!removeEntry) {
    args.entry_name = entry.name;
    args.entry_duration = entry.duration;
    args.entry_story = entry.story;
  }
  const response = await rpc('dear_my_manage_entry', args);
  if (await response.json() !== true) throw new Error('이 기록을 관리할 권한이 없거나 이미 삭제됐어요.');
  if (removeEntry) localStorage.removeItem(ownerTokenKey(entry.id));
}

async function request(query, init = {}, path = '/rest/v1/dear_my_entries') {
  const target = new URL(config.supabaseUrl);
  if (target.protocol !== 'https:') throw new Error('Supabase URL은 HTTPS 주소여야 해요.');
  const endpoint = new URL(path, target);
  endpoint.search = query;
  const response = await fetch(endpoint, {
    ...init,
    headers: { apikey: config.publishableKey, ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw Object.assign(new Error('공동 아카이브 요청 실패 (' + response.status + ')'), { code: details.code });
  }
  return response;
}

function rpc(name, args) {
  return request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }, '/rest/v1/rpc/' + name);
}

export async function loadEntries() {
  if (!shared || invalidConfig) return readLocalEntries();
  const rows = [];
  const pageSize = 24;
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select: 'id,name,duration,story,image', order: 'created_at.desc,id.desc', limit: String(pageSize), offset: String(offset) });
    const response = await request(query);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return [...new Map(rows.map(row => [row.id, row])).values()];
  }
}

export async function saveEntry(entry) {
  if (invalidConfig) throw new Error('공동 아카이브 설정을 확인해주세요.');
  if (!shared) {
    const previous = readLocalEntries();
    const entries = [entry, ...previous.filter(record => record.id !== entry.id)];
    localStorage.setItem(storageKey, JSON.stringify(entries));
    return;
  }
  const token = readOwnerToken(entry.id) || crypto.randomUUID();
  let hasStorage = false;
  try {
    localStorage.setItem(ownerTokenKey(entry.id), token);
    hasStorage = true;
  } catch {
    // A visitor without browser storage can still submit a public entry.
  }

  if (hasStorage) {
    try {
      const response = await rpc('dear_my_create_owned_entry', {
        entry_id: entry.id, owner_token: token, entry_name: entry.name,
        entry_duration: entry.duration, entry_story: entry.story, entry_image: entry.image,
      });
      if (await response.json() !== true) throw new Error('이미 등록된 기록이에요.');
      return;
    } catch (error) {
      if (error.code !== 'PGRST202') throw error;
      localStorage.removeItem(ownerTokenKey(entry.id));
    }
  }

  await request('on_conflict=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(entry),
  });
}
