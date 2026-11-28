-- Signnith Orchestrator Schema (Phase 2: Signals & Feedback Loop)
-- Apply in Supabase SQL Editor for the shared Signnith Suite project.

create extension if not exists pgcrypto;

-- 1. Primary signals emitted by Signnith (Hub)
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  market text not null default 'US', -- 'KR' | 'US'
  style text not null default 'balanced', -- 'short_term' | 'balanced' | 'long_term'
  period text not null default '6mo',
  action text not null check (action in ('BUY', 'SELL', 'HOLD')),
  combined numeric(8,4) not null,
  confidence numeric(6,3) not null,
  composite numeric(8,4) not null default 0,
  tech_score numeric(8,4),
  fund_score numeric(8,4),
  price numeric(18,4),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_signals_ticker_created
  on public.signals (ticker, created_at desc);

create index if not exists idx_signals_user_created
  on public.signals (user_id, created_at desc);

-- 2. Feedbacks returned by connected spoke services
--    (newsfinder, equisense, chartdeepdive, buythedip)
create table if not exists public.signal_feedbacks (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  source_app text not null check (source_app in ('newsfinder', 'equisense', 'chartdeepdive', 'buythedip')),
  score numeric(6,3) not null check (score >= -1 and score <= 1),
  confidence numeric(6,3) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  risk_flag boolean not null default false,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (signal_id, source_app)
);

create index if not exists idx_feedbacks_signal
  on public.signal_feedbacks (signal_id, created_at desc);

-- 3. Optional realized outcomes for backtest/recalibration loop
create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  horizon_days integer not null check (horizon_days > 0),
  realized_return numeric(10,6) not null,
  max_drawdown numeric(10,6),
  evaluated_at timestamptz not null default now(),
  unique (signal_id, horizon_days)
);

-- Row-Level Security (RLS)
alter table public.signals enable row level security;
alter table public.signal_feedbacks enable row level security;
alter table public.signal_outcomes enable row level security;

create policy "Users manage own signals"
  on public.signals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own feedbacks"
  on public.signal_feedbacks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read outcomes for own signals"
  on public.signal_outcomes for select
  using (
    exists (
      select 1 from public.signals s
      where s.id = signal_outcomes.signal_id
        and s.user_id = auth.uid()
    )
  );
