-- Mes ressources ULIS TSLA : exécuter dans Supabase > SQL Editor.
-- Aucune table d'élèves : seules les fiches pédagogiques sont enregistrées.
-- Auth : créer le compte professeur dans Authentication > Users, puis l'autoriser ci-dessous.

create table if not exists public.teacher_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.teacher_accounts enable row level security;
revoke all on public.teacher_accounts from anon, authenticated;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid()));
$$;
revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

create table if not exists public.resources (
  id text primary key check (length(id) between 1 and 160),
  status text not null default 'draft' check(status in ('ready','draft')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists resources_status_idx on public.resources(status);
alter table public.resources enable row level security;
revoke all on public.resources from anon,authenticated;
grant select on public.resources to anon,authenticated;
grant insert,update,delete on public.resources to authenticated;

drop policy if exists "Eleves lisent uniquement les fiches publiees" on public.resources;
create policy "Eleves lisent uniquement les fiches publiees" on public.resources
for select to anon, authenticated using(status = 'ready');

drop policy if exists "Enseignants lisent toutes les fiches" on public.resources;
create policy "Enseignants lisent toutes les fiches" on public.resources
for select to authenticated using((select public.is_teacher()));

drop policy if exists "Enseignants ajoutent" on public.resources;
create policy "Enseignants ajoutent" on public.resources
for insert to authenticated with check((select public.is_teacher()));

drop policy if exists "Enseignants modifient" on public.resources;
create policy "Enseignants modifient" on public.resources
for update to authenticated using((select public.is_teacher()))
with check((select public.is_teacher()));

drop policy if exists "Enseignants suppriment" on public.resources;
create policy "Enseignants suppriment" on public.resources
for delete to authenticated using((select public.is_teacher()));

create table if not exists public.library_revision (
  id integer primary key check(id=1),
  version bigint not null default 0,
  changed_at timestamptz not null default now()
);
insert into public.library_revision(id,version) values (1,0) on conflict(id) do nothing;
alter table public.library_revision enable row level security;
revoke all on public.library_revision from anon,authenticated;
grant select on public.library_revision to anon,authenticated;
drop policy if exists "Revision lisible par les tablettes" on public.library_revision;
create policy "Revision lisible par les tablettes" on public.library_revision
for select to anon,authenticated using (true);

-- Ce signal ne contient aucune donnée de cours : il déclenche une relecture des fiches publiées.
create or replace function public.bump_library_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'ready')
     or (tg_op = 'DELETE' and old.status = 'ready')
     or (tg_op = 'UPDATE' and (old.status = 'ready' or new.status = 'ready')) then
    update public.library_revision set version=version+1,changed_at=now() where id=1;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists resource_publication_signal on public.resources;
create trigger resource_publication_signal after insert or update or delete on public.resources
for each row execute function public.bump_library_revision();

-- Realtime : relayer uniquement le compteur de versions, jamais les brouillons.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='library_revision') then
     alter publication supabase_realtime add table public.library_revision;
  end if;
end $$;

-- IMPORTANT : autoriser manuellement le professeur avec son UUID Supabase Auth :
-- insert into public.teacher_accounts(user_id) values ('UUID_DU_COMPTE_PROFESSEUR');
-- Ne PAS publier ce fichier avec un véritable UUID ou une clé secrète.
