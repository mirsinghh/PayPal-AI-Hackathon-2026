-- AgentDeal persistence + accounts (V5). Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Security model
--   * Supabase Auth (auth.users) owns identities and password hashing. This app never sees or stores a password.
--   * Every table has Row Level Security ON. Users can only SELECT rows whose user_id is their own (auth.uid()).
--   * There are NO insert/update/delete policies for users. All writes come from the server using the secret
--     (service role) key, which sets user_id from the verified login. A client can never write or forge a user_id.
--   * Anonymous demo sessions have user_id NULL and are unreadable with the anon key (only the server reads them).

create table if not exists public.sessions (
  id          text primary key,
  data        jsonb not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.payments (
  id               text primary key,
  session_id       text not null,
  paypal_order_id  text,
  data             jsonb not null,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ---- V5: ownership + flat history columns (a sessions row = request + analysis + negotiation) ----
alter table public.sessions add column if not exists user_id             uuid references auth.users (id) on delete set null;
alter table public.sessions add column if not exists product_query       text;
alter table public.sessions add column if not exists budget_cents        integer;
alter table public.sessions add column if not exists priority            text;
alter table public.sessions add column if not exists status              text;
alter table public.sessions add column if not exists response_mode       text check (response_mode in ('server', 'ai'));
alter table public.sessions add column if not exists engine_mode         text;
alter table public.sessions add column if not exists fallback_reason     text;
alter table public.sessions add column if not exists analysis_source     text;
alter table public.sessions add column if not exists analysis_provider   text;
alter table public.sessions add column if not exists analysis_model      text;
alter table public.sessions add column if not exists analysis_summary    text;
alter table public.sessions add column if not exists offer_count         integer;
alter table public.sessions add column if not exists winner_seller       text;
alter table public.sessions add column if not exists winner_product      text;
alter table public.sessions add column if not exists initial_price_cents integer;
alter table public.sessions add column if not exists final_price_cents   integer;
alter table public.sessions add column if not exists savings_cents       integer;
alter table public.sessions add column if not exists approved_offer_id   text;

alter table public.payments add column if not exists user_id      uuid references auth.users (id) on delete set null;
alter table public.payments add column if not exists status       text;
alter table public.payments add column if not exists amount_cents integer;
alter table public.payments add column if not exists currency     text;

create index if not exists payments_session_idx on public.payments (session_id);
create unique index if not exists payments_order_idx on public.payments (paypal_order_id) where paypal_order_id is not null;
create index if not exists sessions_user_idx on public.sessions (user_id, created_at desc) where user_id is not null;
create index if not exists payments_user_idx on public.payments (user_id, created_at desc) where user_id is not null;

-- ---- Profiles (complementary to auth.users) ----
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---- Row Level Security ----
alter table public.sessions enable row level security;
alter table public.payments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own on public.sessions for select to authenticated using (auth.uid() = user_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select to authenticated using (auth.uid() = user_id);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Defense in depth: the public roles get no write access to the data tables at all.
revoke insert, update, delete on public.sessions from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
