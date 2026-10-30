-- =====================================================================
-- PUMPR · base de données Supabase
-- À coller une seule fois dans Supabase → SQL Editor → New query → Run.
-- Remplace ADMIN_EMAIL (tout en bas) par l'e-mail du compte administrateur.
-- =====================================================================

-- 1. Acheteurs autorisés (une ligne par e-mail qui a payé ou reçu un accès)
create table if not exists public.acces (
  email      text primary key check (email = lower(email)),
  actif      boolean not null default true,
  note       text,
  source     text not null default 'manuel',      -- manuel, lemonsqueezy, stripe…
  cree_le    timestamptz not null default now()
);

-- 2. Administrateurs
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);

-- 3. Profil et configuration du desk de chaque utilisateur
create table if not exists public.profils (
  user_id             uuid primary key references auth.users on delete cascade,
  email               text not null,
  nom                 text,
  config              jsonb not null default '{}'::jsonb,
  configure           boolean not null default false,
  cree_le             timestamptz not null default now(),
  derniere_connexion  timestamptz not null default now()
);

-- 4. Réglages du site de vente (une seule ligne)
create table if not exists public.reglages_site (
  id               int primary key default 1 check (id = 1),
  prix             text default '',
  lien_achat       text default '',
  annonce          text default '',
  ventes_ouvertes  boolean not null default false
);
insert into public.reglages_site (id) values (1) on conflict do nothing;

-- Fonctions utilitaires ------------------------------------------------
create or replace function public.email_courant() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = public.email_courant());
$$;

-- Utilisée avant la création d'un compte : « cet e-mail a-t-il acheté ? »
create or replace function public.email_a_achete(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.acces where email = lower(trim(e)) and actif);
$$;
grant execute on function public.email_a_achete(text) to anon, authenticated;
grant execute on function public.est_admin() to authenticated;

-- Sécurité (RLS) -------------------------------------------------------
alter table public.acces          enable row level security;
alter table public.admins         enable row level security;
alter table public.profils        enable row level security;
alter table public.reglages_site  enable row level security;

drop policy if exists "acces_lecture"  on public.acces;
drop policy if exists "acces_admin"    on public.acces;
create policy "acces_lecture" on public.acces for select to authenticated
  using (email = public.email_courant() or public.est_admin());
create policy "acces_admin" on public.acces for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists "admins_lecture" on public.admins;
create policy "admins_lecture" on public.admins for select to authenticated
  using (public.est_admin());

drop policy if exists "profils_lecture" on public.profils;
drop policy if exists "profils_creation" on public.profils;
drop policy if exists "profils_modif" on public.profils;
create policy "profils_lecture" on public.profils for select to authenticated
  using (user_id = auth.uid() or public.est_admin());
create policy "profils_creation" on public.profils for insert to authenticated
  with check (user_id = auth.uid() and public.email_a_achete(public.email_courant()));
create policy "profils_modif" on public.profils for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "site_lecture" on public.reglages_site;
drop policy if exists "site_admin" on public.reglages_site;
create policy "site_lecture" on public.reglages_site for select to anon, authenticated using (true);
create policy "site_admin" on public.reglages_site for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- 5. Demandes de rétractation (bouton obligatoire) ------------------
create table if not exists public.retractations (
  id        uuid primary key default gen_random_uuid(),
  email     text not null,
  nom       text,
  commande  text,
  message   text,
  statut    text not null default 'nouvelle',   -- nouvelle, remboursee, refusee
  cree_le   timestamptz not null default now()
);
alter table public.retractations enable row level security;
drop policy if exists "retract_admin" on public.retractations;
create policy "retract_admin" on public.retractations for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create or replace function public.demander_retractation(e text, n text, c text, m text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  insert into public.retractations (email, nom, commande, message)
  values (lower(trim(e)), left(n, 80), left(c, 80), left(m, 600)) returning id into rid;
  return rid;
end $$;
grant execute on function public.demander_retractation(text, text, text, text) to anon, authenticated;

-- Premier administrateur : remplace l'adresse ci-dessous ----------------
insert into public.admins (email) values (lower('ADMIN_EMAIL')) on conflict do nothing;
insert into public.acces (email, note) values (lower('ADMIN_EMAIL'), 'compte admin') on conflict do nothing;
