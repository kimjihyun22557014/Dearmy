import { config } from './config.js';

export const shared = Boolean(config.supabaseUrl && config.publishableKey);
export const invalidConfig = Boolean(config.supabaseUrl) !== Boolean(config.publishableKey)
  || (shared && !config.publishableKey.startsWith('sb_publishable_'));

const storageKey = 'dear-my-archive-records-v1';

async function request(query, init = {}) {
  const target = new URL(config.supabaseUrl);
  if (target.protocol !== 'https:') throw new Error('Supabase URL은 HTTPS 주소여야 해요.');
  const endpoint = new URL('/rest/v1/dear_my_entries', target);
  endpoint.search = query;
  const response = await fetch(endpoint, {
    ...init,
    headers: { apikey: config.publishableKey, ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('공동 아카이브 요청 실패 (' + response.status + ')');
  return response;
}

export async function loadEntries() {
  if (!shared || invalidConfig) {
    const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return records;
  }
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
    const previous = await loadEntries();
    const entries = [entry, ...previous.filter(record => record.id !== entry.id)];
    localStorage.setItem(storageKey, JSON.stringify(entries));
    return;
  }
  await request('on_conflict=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(entry),
  });
}
