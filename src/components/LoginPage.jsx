import { useState } from 'react';
import { login } from '../utils/storage';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(username.trim(), password.trim());
    if (result.success) {
      onLogin(username.trim());
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-header">
        <div className="logo">⛳</div>
        <h1>골프 정산</h1>
        <p>라운드 비용 계산기</p>
      </div>
      <div className="login-card">
        <h2>로그인</h2>
        <p className="login-hint">처음이라면 입력하면 자동으로 계정이 만들어져요</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>아이디 (이름)</label>
            <input
              type="text"
              placeholder="한글 이름도 가능합니다"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input
              type="password"
              placeholder="6자리 이상"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              disabled={loading}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={!username.trim() || !password.trim() || loading}
          >
            {loading ? '로그인 중...' : '시작하기'}
          </button>
        </form>
      </div>
      <p className="footer-text">⛳ 즐거운 라운드 되세요!</p>
    </div>
  );
}
