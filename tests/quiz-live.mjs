// 퀴즈게임 실DB 테스트 공용 부품: 접속 정보 읽기, 테스트용 익명 강사 만들기, 테스트 계정 정리
// 테스트 강사는 user_metadata.quiz_test 표식을 달고 만들어, 끝나면 그 표식이 있는 익명 계정만 지운다(퀴즈 행은 연쇄 삭제).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      const m = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* 파일이 없으면 다음 후보 */ }
  }
  throw new Error(`${name} 가 .env 에 없습니다`);
}

export const SUPA_URL = readEnv('VITE_SUPABASE_URL');
export const SUPA_KEY = readEnv('VITE_SUPABASE_ANON_KEY');
export const PROJECT_REF = new URL(SUPA_URL).hostname.split('.')[0];
export const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export function anonClient() {
  return createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function makeHost(label) {
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { quiz_test: label } } });
  if (error) throw error;
  return { client, user: data.user, session: data.session };
}

export function cleanupTestUsers() {
  execFileSync('supabase', [
    'db', 'query', '--linked', '--project-ref', PROJECT_REF,
    "delete from auth.users where is_anonymous and raw_user_meta_data ? 'quiz_test'",
  ], { cwd: ROOT, stdio: 'pipe' });
}

export function countTestUsers() {
  const out = execFileSync('supabase', [
    'db', 'query', '--linked', '--project-ref', PROJECT_REF, '--output-format', 'json',
    "select count(*)::int as n from auth.users where is_anonymous and raw_user_meta_data ? 'quiz_test'",
  ], { cwd: ROOT, stdio: 'pipe' }).toString();
  return Number(out.match(/"n":\s*(\d+)/)?.[1]);
}
