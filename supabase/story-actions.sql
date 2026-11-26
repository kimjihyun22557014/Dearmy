begin;

create schema if not exists dear_my_private;
revoke all on schema dear_my_private from public, anon, authenticated;

create table if not exists dear_my_private.entry_owners (
  entry_id uuid primary key references public.dear_my_entries(id) on delete cascade,
  token_hash bytea not null
);
alter table dear_my_private.entry_owners enable row level security;
revoke all on table dear_my_private.entry_owners from public, anon, authenticated;

create or replace function public.dear_my_create_owned_entry(
  entry_id uuid, owner_token uuid, entry_name text, entry_duration text, entry_story text, entry_image text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if owner_token is null then return false; end if;
  insert into public.dear_my_entries (id, name, duration, story, image)
  values (entry_id, entry_name, entry_duration, entry_story, entry_image)
  on conflict (id) do nothing;
  if found then
    insert into dear_my_private.entry_owners values
      (entry_id, pg_catalog.sha256(pg_catalog.convert_to(owner_token::text, 'UTF8')));
    return true;
  end if;
  return exists (
    select 1 from dear_my_private.entry_owners as owner
    where owner.entry_id = dear_my_create_owned_entry.entry_id
      and owner.token_hash = pg_catalog.sha256(pg_catalog.convert_to(owner_token::text, 'UTF8'))
  );
end;
$$;

create or replace function public.dear_my_manage_entry(
  entry_id uuid, owner_token uuid, remove_entry boolean,
  entry_name text default null, entry_duration text default null, entry_story text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if remove_entry then
    delete from public.dear_my_entries as entry
    using dear_my_private.entry_owners as owner
    where entry.id = dear_my_manage_entry.entry_id and owner.entry_id = entry.id
      and owner.token_hash = pg_catalog.sha256(pg_catalog.convert_to(owner_token::text, 'UTF8'));
  else
    update public.dear_my_entries as entry
    set name = entry_name, duration = entry_duration, story = entry_story
    from dear_my_private.entry_owners as owner
    where entry.id = dear_my_manage_entry.entry_id and owner.entry_id = entry.id
      and owner.token_hash = pg_catalog.sha256(pg_catalog.convert_to(owner_token::text, 'UTF8'));
  end if;
  return found;
end;
$$;

revoke all on function public.dear_my_create_owned_entry(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.dear_my_manage_entry(uuid, uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.dear_my_create_owned_entry(uuid, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.dear_my_manage_entry(uuid, uuid, boolean, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';

commit;
