// Supabase 무료 플랜의 "7일 미사용 시 자동 일시정지"를 막기 위해 하루 한 번 DB를 깨우는 크론 엔드포인트
// vercel.json의 crons가 매일 호출한다. 사용자가 브라우저로 직접 열어 상태를 확인할 수도 있다.
// 주의: 이미 일시정지된 프로젝트는 이 요청으로 깨어나지 않는다. 정지되기 전에 막는 용도다.
export default async function handler(request, response) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const now = new Date().toISOString();

  if (!url || !key) {
    return response.status(500).json({
      ok: false,
      at: now,
      error: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 없습니다.',
    });
  }

  try {
    // RLS 때문에 익명에게는 0행이 돌아오지만, 요청은 PostgREST를 거쳐 실제 DB까지 도달한다.
    // Supabase는 이 도달을 "활동"으로 집계하므로 미사용 일수가 초기화된다.
    const res = await fetch(`${url}/rest/v1/game_records?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return response.status(502).json({
        ok: false,
        at: now,
        status: res.status,
        error: 'Supabase가 응답했지만 정상 상태가 아닙니다.',
      });
    }

    return response.status(200).json({ ok: true, at: now, status: res.status });
  } catch (e) {
    // DNS 실패는 프로젝트가 이미 일시정지됐다는 신호다. 이 경우 대시보드에서 수동 복원해야 한다.
    return response.status(503).json({
      ok: false,
      at: now,
      error: String(e?.message || e),
      hint: '이미 일시정지된 상태일 수 있습니다. Supabase 대시보드에서 Restore가 필요합니다.',
    });
  }
}
