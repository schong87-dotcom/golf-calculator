// 모임 정산 화면 전체. 작업본을 불러와 입력이 바뀔 때마다 저장하고, 정산 계산·저장 목록을 다룬다.
// 계산식과 비용 항목 카드는 골프 정산 것을 그대로 쓰고, 인원 수만 자유롭게 바뀐다.
import { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import MeetingInfo from './MeetingInfo';
import MeetingParticipants from './MeetingParticipants';
import CostItems from './CostItems';
import SettlementResult from './SettlementResult';
import MeetingHistoryModal from './MeetingHistoryModal';
import {
  saveMeeting, loadMeeting, saveMeetingToHistory, deleteMeetingFromHistory,
} from '../utils/meetingStorage';
import {
  makeDefaultMeeting, addParticipant, removeParticipant, renameParticipant, findDuplicateNames,
} from '../utils/meeting';
import { calculateSettlement } from '../utils/settlement';

export default function MeetingApp({ onBackToHub, onLogout }) {
  const [meeting, setMeeting] = useState(makeDefaultMeeting);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  // 불러오기 전에 입력을 받으면 늦게 도착한 작업본이 덮어쓰므로, 도착할 때까지 로딩 화면을 보인다
  useEffect(() => {
    let cancelled = false;
    loadMeeting()
      .then(saved => { if (!cancelled && saved) setMeeting(saved); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // patch는 바꿀 필드 객체이거나, 이전 모임을 받아 다음 모임을 돌려주는 함수다
  const updateMeeting = useCallback(patch => {
    setMeeting(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      saveMeeting(next);
      return next;
    });
    setResult(null);
  }, []);

  const handleReset = () => {
    if (window.confirm('현재 입력 내용을 모두 초기화하시겠습니까?')) {
      const fresh = makeDefaultMeeting();
      setMeeting(fresh);
      setResult(null);
      saveMeeting(fresh);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dbId = await saveMeetingToHistory(meeting);
      const updated = { ...meeting, dbId };
      setMeeting(updated);
      saveMeeting(updated);
      alert('저장되었습니다!');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = () => {
    setResult(calculateSettlement(meeting.participants, meeting.items));
    setTimeout(() => {
      document.getElementById('settlement-result')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleLoadHistory = saved => {
    setMeeting(saved);
    setResult(null);
    saveMeeting(saved);
  };

  const named = meeting.participants.filter(p => p && p.trim());
  const duplicates = findDuplicateNames(meeting.participants);
  const hasAmounts = meeting.items.some(i => Number(i.amount) > 0);
  const canCalculate = named.length >= 2 && hasAmounts && duplicates.length === 0;
  const canSave = named.length > 0 || !!meeting.title;

  if (!loaded) {
    return (
      <div className="loading-screen">
        <span>🧾</span>
        <p>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        logo="🧾"
        title="모임 정산"
        subtitle="모임 비용 계산기"
        canSave={canSave}
        onSave={handleSave}
        onReset={handleReset}
        onLogout={onLogout}
        onOpenHistory={() => setShowHistory(true)}
        onBackToHub={onBackToHub}
      />

      <main className="main-content">
        <MeetingInfo
          date={meeting.date}
          title={meeting.title}
          onChange={patch => updateMeeting(patch)}
        />
        <MeetingParticipants
          participants={meeting.participants}
          duplicates={duplicates}
          onRename={(i, value) => updateMeeting(prev => renameParticipant(prev, i, value))}
          onAdd={() => updateMeeting(addParticipant)}
          onRemove={i => updateMeeting(prev => removeParticipant(prev, i))}
        />
        <CostItems
          items={meeting.items}
          participants={meeting.participants}
          onChange={items => updateMeeting({ items })}
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
          <SettlementResult result={result} participants={meeting.participants} />
        </div>

        <p className="footer-text">🧾 즐거운 모임 되세요!</p>
      </main>

      {showHistory && (
        <MeetingHistoryModal
          onLoad={handleLoadHistory}
          onDelete={deleteMeetingFromHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
