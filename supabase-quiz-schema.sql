-- 퀴즈게임 테이블과 함수. 강사(로그인 사용자)는 RLS로 본인 것만 다루고,
-- 수강생은 로그인 없이 quiz_join, quiz_player_state, quiz_submit 세 함수로만 접근한다(정답은 공개 전까지 내보내지 않는다).
-- 기존 앱 테이블(current_round, rounds, current_meeting, meetings, game_records)은 건드리지 않는다. 여러 번 실행해도 된다.

-- ─── 퀴즈 (강사가 만든 문제 묶음) ───────────────────────────────────────────

create table if not exists quiz_quizzes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null default '',
  questions  jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quiz_quizzes enable row level security;
drop policy if exists "own quiz_quizzes" on quiz_quizzes;
create policy "own quiz_quizzes" on quiz_quizzes for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create index if not exists quiz_quizzes_owner on quiz_quizzes (owner_id, updated_at desc);

-- ─── 진행 세션 (퀴즈를 한 번 진행할 때마다 1행, 시작 시점 문제 사본을 가진다) ──

create table if not exists quiz_sessions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  quiz_id       uuid references quiz_quizzes on delete set null,
  code          text not null unique check (code ~ '^[0-9]{6}$'),
  title         text not null default '',
  questions     jsonb not null,                       -- 정답 포함. 수강생은 직접 읽지 못한다
  status        text not null default 'lobby' check (status in ('lobby', 'open', 'closed', 'revealed', 'ended')),
  current_index int  not null default -1,
  revealed      jsonb not null default '[]',          -- 정답을 공개한 문제 id 목록
  accepts       jsonb not null default '{}',          -- 원클릭 인정 {문제id: [{value, item}]}
  reveal        jsonb,                                -- 지금 문제의 공개 내용(정답, 집계). 공개 뒤에만 채운다
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table quiz_sessions enable row level security;
drop policy if exists "own quiz_sessions" on quiz_sessions;
create policy "own quiz_sessions" on quiz_sessions for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create index if not exists quiz_sessions_owner on quiz_sessions (owner_id, created_at desc);

-- ─── 참가자 (수강생). 토큰은 해시만 저장한다 ─────────────────────────────────

create table if not exists quiz_participants (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions on delete cascade,
  name       text not null,
  token_hash bytea not null,
  score      int  not null default 0,
  rank       int,
  results    jsonb not null default '{}',             -- 공개한 문제별 {correct, points, matched}
  joined_at  timestamptz not null default now()
);

create unique index if not exists quiz_participants_name on quiz_participants (session_id, lower(name));
create index if not exists quiz_participants_token on quiz_participants (session_id, token_hash);

alter table quiz_participants enable row level security;
drop policy if exists "host reads quiz_participants" on quiz_participants;
create policy "host reads quiz_participants" on quiz_participants for select to authenticated
  using (exists (select 1 from quiz_sessions s where s.id = session_id and s.owner_id = (select auth.uid())));
drop policy if exists "host updates quiz_participants" on quiz_participants;
create policy "host updates quiz_participants" on quiz_participants for update to authenticated
  using (exists (select 1 from quiz_sessions s where s.id = session_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from quiz_sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

-- ─── 응답 (한 사람이 한 문제에 한 번) ────────────────────────────────────────

create table if not exists quiz_responses (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references quiz_sessions on delete cascade,
  participant_id uuid not null references quiz_participants on delete cascade,
  question_id    text not null,
  answer         jsonb not null,
  submitted_at   timestamptz not null default now(),
  unique (participant_id, question_id)
);

create index if not exists quiz_responses_question on quiz_responses (session_id, question_id);

alter table quiz_responses enable row level security;
drop policy if exists "host reads quiz_responses" on quiz_responses;
create policy "host reads quiz_responses" on quiz_responses for select to authenticated
  using (exists (select 1 from quiz_sessions s where s.id = session_id and s.owner_id = (select auth.uid())));

-- ─── 수강생에게 보여 줄 문제 (허용 목록 방식으로 정답 필드를 뺀다) ─────────────

create or replace function quiz_public_question(q jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', q->'id', 'type', q->'type', 'prompt', q->'prompt', 'points', q->'points', 'slots', q->'slots', 'pick', q->'pick',
    'options', case when q->>'type' in ('choice', 'multi') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', o->'id', 'label', o->'label') order by n), '[]'::jsonb)
      from jsonb_array_elements(q->'options') with ordinality as t(o, n)
    ) end
  ))
$$;

-- ─── 수강생 함수 1. 이름으로 입장 → 이 기기만 아는 토큰을 돌려준다 ─────────────

create or replace function quiz_join(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s quiz_sessions;
  v_name text := btrim(coalesce(p_name, ''));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into s from quiz_sessions where code = p_code;
  if not found then raise exception 'quiz_not_found'; end if;
  if s.status = 'ended' then raise exception 'quiz_ended'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'quiz_bad_name'; end if;
  if (select count(*) from quiz_participants where session_id = s.id) >= 500 then raise exception 'quiz_full'; end if;
  begin
    insert into quiz_participants (session_id, name, token_hash)
    values (s.id, v_name, sha256(convert_to(v_token, 'UTF8')));
  exception when unique_violation then
    raise exception 'quiz_name_taken';
  end;
  return jsonb_build_object('token', v_token, 'name', v_name);
end $$;

-- ─── 수강생 함수 2. 지금 화면 상태 (정답은 공개된 문제만) ─────────────────────

create or replace function quiz_player_state(p_code text, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s quiz_sessions;
  p quiz_participants;
  q jsonb;
  v_qid text;
  v_out jsonb;
begin
  select * into s from quiz_sessions where code = p_code;
  if not found then raise exception 'quiz_not_found'; end if;
  v_out := jsonb_build_object('session', jsonb_build_object(
    'id', s.id, 'title', s.title, 'status', s.status, 'index', s.current_index,
    'total', jsonb_array_length(s.questions),
    'participants', (select count(*) from quiz_participants where session_id = s.id)));

  select * into p from quiz_participants
  where session_id = s.id and token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if not found then return v_out || jsonb_build_object('me', null); end if;
  v_out := v_out || jsonb_build_object('me', jsonb_build_object('name', p.name, 'score', p.score, 'rank', p.rank));

  if s.status in ('open', 'closed', 'revealed') and s.current_index >= 0 then
    q := s.questions -> s.current_index;
    v_qid := q->>'id';
    v_out := v_out || jsonb_build_object(
      'question', quiz_public_question(q),
      'myAnswer', (select answer from quiz_responses where participant_id = p.id and question_id = v_qid));
    if s.status = 'revealed' and s.reveal->>'questionId' = v_qid then
      v_out := v_out || jsonb_build_object('reveal', s.reveal, 'myResult', p.results -> v_qid);
    end if;
  end if;

  if s.status = 'ended' then
    v_out := v_out || jsonb_build_object('podium', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'score', score, 'rank', rank) order by rank, name), '[]'::jsonb)
      from quiz_participants where session_id = s.id and rank <= 3));
  end if;
  return v_out;
end $$;

-- ─── 수강생 함수 3. 답 제출 (열린 문제에 한 번만) ────────────────────────────

create or replace function quiz_submit(p_code text, p_token text, p_question_id text, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s quiz_sessions;
  p quiz_participants;
begin
  select * into s from quiz_sessions where code = p_code;
  if not found then raise exception 'quiz_not_found'; end if;
  select * into p from quiz_participants
  where session_id = s.id and token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if not found then raise exception 'quiz_not_joined'; end if;
  if s.status <> 'open' then raise exception 'quiz_not_open'; end if;
  if (s.questions -> s.current_index ->> 'id') is distinct from p_question_id then raise exception 'quiz_wrong_question'; end if;
  if jsonb_typeof(p_answer) is distinct from 'object' or octet_length(p_answer::text) > 4000 then
    raise exception 'quiz_bad_answer';
  end if;
  insert into quiz_responses (session_id, participant_id, question_id, answer)
  values (s.id, p.id, p_question_id, p_answer)
  on conflict (participant_id, question_id) do nothing;
  if not found then raise exception 'quiz_already_answered'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── 강사 함수. 진행 상태와 점수를 한 번에 바꾼다 (RLS가 본인 세션만 허용) ─────

create or replace function quiz_host_apply(p_session uuid, p_patch jsonb, p_scores jsonb default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update quiz_sessions set
    status        = coalesce(p_patch->>'status', status),
    current_index = coalesce((p_patch->>'current_index')::int, current_index),
    revealed      = coalesce(p_patch->'revealed', revealed),
    accepts       = coalesce(p_patch->'accepts', accepts),
    reveal        = case when p_patch ? 'reveal' then nullif(p_patch->'reveal', 'null'::jsonb) else reveal end,
    updated_at    = now()
  where id = p_session;
  if not found then raise exception 'quiz_not_owner'; end if;

  if p_scores is not null then
    update quiz_participants qp set
      score   = (x->>'score')::int,
      rank    = (x->>'rank')::int,
      results = coalesce(x->'results', '{}'::jsonb)
    from jsonb_array_elements(p_scores) as x
    where qp.session_id = p_session and qp.id = (x->>'id')::uuid;
  end if;
end $$;

revoke execute on function quiz_host_apply(uuid, jsonb, jsonb) from public, anon;
grant execute on function quiz_host_apply(uuid, jsonb, jsonb) to authenticated;
