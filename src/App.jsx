import { useState, useEffect, useCallback, useRef } from 'react';
import LoginPage from './components/LoginPage';
import AppHub from './components/AppHub';
import Header from './components/Header';
import RoundInfo from './components/RoundInfo';
import Participants from './components/Participants';
import CostItems from './components/CostItems';
import SettlementResult from './components/SettlementResult';
import HistoryModal from './components/HistoryModal';
import {
  onAuthChange, logout,
  saveRound, loadRound,
  saveRoundToHistory, getSavedRounds, deleteRoundFromHistory,
} from './utils/storage';
import { calculateSettlement } from './utils/settlement';
import './App.css';

const DEFAULT_ITEMS = [
  { id: 1, name: '그린피 (카트비 포함)', amount: '', payers: [], excluded: [] },
  { id: 2, name: '캐디피', amount: '', payers: [], excluded: [] },
  { id: 3, name: '골프장 식음료', amount: '', payers: [], excluded: [] },
  { id: 4, name: '외부 식사', amount: '', payers: [], excluded: [] },
];

function makeDefaultRound() {
  return {
    id: Date.now(),
    dbId: null,
    date: '',
    course: '',
    participants: ['', '', '', ''],
    items: DEFAULT_ITEMS.map(i => ({ ...i })),
  };
}

export default function App() {
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);
  // 로그인 후 어떤 앱을 보여줄지. 재무제표 게임은 /game/ 정적 페이지라 여기 들어오지 않는다.
  const [view, setView] = useState('hub');
  const [round, setRound] = useState(makeDefaultRound());
  const [result, setResult] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  // 세션 감지: 최초 로드, OAuth 리다이렉트 복귀, 로그아웃 모두 여기서 처리
  // roundLoadedRef: 토큰 갱신 등 반복 이벤트에서 loadRound가 편집 중인 화면을 덮어쓰지 않도록 최초 1회만 로드
  const roundLoadedRef = useRef(false);
  useEffect(() => {
    return onAuthChange(session => {
      if (session) {
        setUsername(session.username);
        if (!roundLoadedRef.current) {
          roundLoadedRef.current = true;
          loadRound().then(saved => {
            if (saved) setRound(saved);
          });
        }
      } else {
        roundLoadedRef.current = false;
        setUsername(null);
      }
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    setUsername(null);
    setView('hub');
    setRound(makeDefaultRound());
    setResult(null);
  };

  const handleReset = () => {
    if (window.confirm('현재 입력 내용을 모두 초기화하시겠습니까?')) {
      const fresh = makeDefaultRound();
      setRound(fresh);
      setResult(null);
      saveRound(fresh);
    }
  };

  const updateRound = useCallback(patch => {
    setRound(prev => {
      const next = { ...prev, ...patch };
      saveRound(next);
      return next;
    });
    setResult(null);
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dbId = await saveRoundToHistory(round);
      const updated = { ...round, dbId };
      setRound(updated);
      saveRound(updated);
      alert('저장되었습니다!');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = () => {
    const r = calculateSettlement(round.participants, round.items);
    setResult(r);
    setTimeout(() => {
      document.getElementById('settlement-result')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleLoadHistory = saved => {
    setRound(saved);
    setResult(null);
    saveRound(saved);
  };

  const handleDeleteHistory = async dbId => {
    await deleteRoundFromHistory(dbId);
  };

  const named = round.participants.filter(p => p && p.trim());
  const hasAmounts = round.items.some(i => Number(i.amount) > 0);
  const canCalculate = named.length >= 2 && hasAmounts;
  const canSave = named.length > 0 || !!round.course;

  if (loading) {
    return (
      <div className="loading-screen">
        <span>⛳</span>
        <p>불러오는 중...</p>
      </div>
    );
  }

  if (!username) {
    return <LoginPage />;
  }

  if (view === 'hub') {
    return (
      <AppHub
        username={username}
        onSelectGolf={() => setView('golf')}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="app">
      <Header
        canSave={canSave}
        saving={saving}
        onSave={handleSave}
        onReset={handleReset}
        onLogout={handleLogout}
        onOpenHistory={() => setShowHistory(true)}
        onBackToHub={() => setView('hub')}
      />

      <main className="main-content">
        <RoundInfo
          date={round.date}
          course={round.course}
          onChange={patch => updateRound(patch)}
        />
        <Participants
          participants={round.participants}
          onChange={participants => updateRound({ participants })}
        />
        <CostItems
          items={round.items}
          participants={round.participants}
          onChange={items => updateRound({ items })}
        />
        <div className="action-bar">
          <button
            className={`btn-calculate ${canCalculate ? '' : 'disabled'}`}
            onClick={canCalculate ? handleCalculate : undefined}
          >
            📊 정산 계산하기
          </button>
          <button
            className={`btn-save-bottom ${canSave && !saving ? '' : 'disabled'}`}
            onClick={canSave && !saving ? handleSave : undefined}
          >
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>

        <div id="settlement-result">
          <SettlementResult result={result} participants={round.participants} />
        </div>

        <p className="footer-text">⛳ 즐거운 라운드 되세요!</p>
      </main>

      {showHistory && (
        <HistoryModal
          onLoad={handleLoadHistory}
          onDelete={handleDeleteHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
