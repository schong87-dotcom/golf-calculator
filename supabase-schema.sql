-- 현재 작업 중인 라운드 (사용자당 1개)
create table if not exists current_round (
  user_id uuid references auth.users on delete cascade primary key,
  data    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table current_round enable row level security;

create policy "own current_round" on current_round
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 저장된 라운드 히스토리
create table if not exists rounds (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  round_date  text,
  course      text,
  participants text[]  not null default '{}',
  items       jsonb    not null default '[]',
  saved_at    timestamptz not null default now()
);

alter table rounds enable row level security;

create policy "own rounds" on rounds
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists rounds_user_saved on rounds (user_id, saved_at desc);
