-- Small public exhibition archive. Photos are stored as compressed raster images.
create table if not exists public.dear_my_entries (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  duration text not null check (char_length(btrim(duration)) between 1 and 40),
  story text not null check (char_length(btrim(story)) between 1 and 1000),
  image text not null check (
    char_length(image) <= 294000
    and image ~ '^data:image/(webp|png);base64,[A-Za-z0-9+/]+={0,2}$'
  ),
  created_at timestamptz not null default now()
);
create index if not exists dear_my_entries_latest on public.dear_my_entries (created_at desc, id desc);

alter table public.dear_my_entries enable row level security;
revoke all on public.dear_my_entries from anon, authenticated;
grant select on public.dear_my_entries to anon, authenticated;
grant insert (id, name, duration, story, image) on public.dear_my_entries to anon, authenticated;

drop policy if exists "Read exhibition entries" on public.dear_my_entries;
create policy "Read exhibition entries" on public.dear_my_entries for select to anon, authenticated using (true);

drop policy if exists "Add exhibition entries" on public.dear_my_entries;
create policy "Add exhibition entries" on public.dear_my_entries for insert to anon, authenticated with check (true);
