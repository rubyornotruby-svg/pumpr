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

-- 6. Journal de trades sauvegardé dans le compte (une ligne par utilisateur)
create table if not exists public.journaux (
  user_id  uuid primary key references auth.users on delete cascade,
  trades   jsonb not null default '[]'::jsonb,
  maj_le   timestamptz not null default now()
);
alter table public.journaux enable row level security;
drop policy if exists "journal_perso" on public.journaux;
create policy "journal_perso" on public.journaux for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7. Liste d'attente (page « Réserver mon accès fondateur ») ----------
create table if not exists public.liste_attente (
  id            bigint generated always as identity primary key,
  email         text not null unique check (email = lower(email)),
  code_parrain  text not null unique,
  parraine_par  text,
  source        text default 'liste_attente',
  cree_le       timestamptz not null default now()
);
alter table public.liste_attente enable row level security;
drop policy if exists "attente_inscription" on public.liste_attente;
drop policy if exists "attente_admin" on public.liste_attente;
create policy "attente_inscription" on public.liste_attente for insert to anon, authenticated
  with check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) < 200);
create policy "attente_admin" on public.liste_attente for select to authenticated
  using (public.est_admin());
-- Compteur public (vrai nombre d'inscrits, sans exposer les e-mails)
create or replace function public.nb_inscrits() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.liste_attente;
$$;
grant execute on function public.nb_inscrits() to anon, authenticated;

-- Premier administrateur : remplace l'adresse ci-dessous ----------------
insert into public.admins (email) values (lower('ADMIN_EMAIL')) on conflict do nothing;
insert into public.acces (email, note) values (lower('ADMIN_EMAIL'), 'compte admin') on conflict do nothing;

-- =====================================================================
-- 8. SÉCURITÉ RENFORCÉE (audit du 31/10/2026)
--    Tout ce bloc peut être relancé sans risque. À garder APRÈS le reste.
-- =====================================================================

-- 8a. Admin seulement si son e-mail est CONFIRMÉ (même si « Confirm email »
--     était désactivé par erreur, personne ne peut devenir admin en
--     s'inscrivant avec l'adresse admin avant toi).
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;

-- 8b. Personne de l'extérieur ne peut tester « cet e-mail a-t-il acheté ? »
revoke execute on function public.email_a_achete(text) from public, anon;
grant execute on function public.email_a_achete(text) to authenticated;

-- 8c. Création de compte refusée par le serveur si l'e-mail n'a pas d'accès
--     (à retirer le jour où on ouvre des comptes gratuits).
create or replace function public.verifier_achat_inscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.acces where email = lower(new.email) and actif) then
    raise exception 'PUMPR_PAS_ACHAT';
  end if;
  return new;
end $$;
drop trigger if exists pumpr_verifier_achat on auth.users;
create trigger pumpr_verifier_achat before insert on auth.users
  for each row execute function public.verifier_achat_inscription();

-- 8d. Profil : l'utilisateur ne peut modifier que ses réglages, pas son e-mail
revoke insert, update on public.profils from anon, authenticated;
grant insert (user_id, email, nom, config, configure, derniere_connexion) on public.profils to authenticated;
grant update (nom, config, configure, derniere_connexion) on public.profils to authenticated;
drop policy if exists "profils_creation" on public.profils;
create policy "profils_creation" on public.profils for insert to authenticated
  with check (user_id = auth.uid() and email = public.email_courant() and public.email_a_achete(public.email_courant()));
alter table public.profils drop constraint if exists profils_tailles;
alter table public.profils add constraint profils_tailles
  check (length(coalesce(nom, '')) <= 40 and pg_column_size(config) < 20000);

-- 8e. Journal : taille maximale (évite qu'un compte remplisse la base)
alter table public.journaux drop constraint if exists journaux_taille;
alter table public.journaux add constraint journaux_taille check (octet_length(trades::text) < 3000000);

-- 8f. Réglages du site : lien d'achat https obligatoire, textes courts
alter table public.reglages_site drop constraint if exists reglages_controles;
alter table public.reglages_site add constraint reglages_controles check (
  coalesce(lien_achat, '') ~ '^(https://[^[:space:]]{4,500})?$'
  and length(coalesce(prix, '')) <= 40 and length(coalesce(annonce, '')) <= 160);

-- 8g. Rétractation : anti-spam (3 par e-mail et par heure, 30 au total par 10 min)
create or replace function public.demander_retractation(e text, n text, c text, m text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; em text := lower(trim(coalesce(e, '')));
begin
  if em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(em) > 200 then raise exception 'PUMPR_EMAIL'; end if;
  if (select count(*) from public.retractations where email = em and cree_le > now() - interval '1 hour') >= 3
     or (select count(*) from public.retractations where cree_le > now() - interval '10 minutes') >= 30 then
    raise exception 'PUMPR_TROP';
  end if;
  insert into public.retractations (email, nom, commande, message)
  values (em, left(n, 80), left(c, 80), left(m, 600)) returning id into rid;
  return rid;
end $$;
revoke execute on function public.demander_retractation(text, text, text, text) from public;
grant execute on function public.demander_retractation(text, text, text, text) to anon, authenticated;

-- 8h. Liste d'attente : inscription uniquement par cette fonction (anti-spam,
--     et on ne peut plus savoir si un e-mail est déjà inscrit).
drop policy if exists "attente_inscription" on public.liste_attente;
create or replace function public.rejoindre_liste(e text, parrain text default null) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(e, '')));
begin
  if em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(em) > 200 then raise exception 'PUMPR_EMAIL'; end if;
  if (select count(*) from public.liste_attente where cree_le > now() - interval '10 minutes') >= 60 then raise exception 'PUMPR_TROP'; end if;
  insert into public.liste_attente (email, code_parrain, parraine_par)
  values (em, substr(md5(random()::text || clock_timestamp()::text || em), 1, 8), left(parrain, 12))
  on conflict (email) do nothing;
end $$;
revoke execute on function public.rejoindre_liste(text, text) from public;
grant execute on function public.rejoindre_liste(text, text) to anon, authenticated;
revoke execute on function public.nb_inscrits() from public;
grant execute on function public.nb_inscrits() to anon, authenticated;
