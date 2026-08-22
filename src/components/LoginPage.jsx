// 두 앱(골프 정산 · 재무제표 게임) 공통 진입점. 구글 OAuth 로그인 버튼만 제공한다.
import { useState } from 'react';
import { loginWithGoogle } from '../utils/storage';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const result = await loginWithGoogle();
    if (!result.success) {
      setError(result.message);
      setLoading(false);
    }
    // 성공 시 구글 로그인 페이지로 리다이렉트되므로 loading 해제 불필요
  };

  return (
    <div className="login-page">
      <div className="login-header">
        <div className="logo dual">⛳📊</div>
        <h1>앱 모음</h1>
        <p>골프 정산 · 재무제표 학습 게임</p>
      </div>
      <div className="login-card">
        <h2>로그인</h2>
        <p className="login-hint">구글 계정으로 간편하게 시작하세요</p>
        <button
          type="button"
          className="btn-google"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? '이동 중...' : '구글로 로그인'}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
}
