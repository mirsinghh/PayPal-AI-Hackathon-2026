-- AgentDeal persistence. Run once in the Supabase SQL editor.
-- RLS is enabled with NO policies: the anon/public key can read nothing.
-- Only the server, using the secret (service role) key, can read and write.

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

create index if not exists payments_session_idx on public.payments (session_id);
create unique index if not exists payments_order_idx on public.payments (paypal_order_id) where paypal_order_id is not null;

alter table public.sessions enable row level security;
alter table public.payments enable row level security;
