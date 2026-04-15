import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfigApi, deleteConfigApi, getLogsApi, testWebhookApi, runCheckNowApi } from '../services/api';
import { LogOut, RefreshCw, Bell, Settings, Activity, Plus, Edit2, Trash2, Calendar, Zap, Wifi } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser]       = useState(null);
  const [configs, setConfigs] = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState({}); // { [configId]: 'test' | 'check' | null }

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [targetToDelete, setTargetToDelete]       = useState(null);
  const [configTab, setConfigTab]                 = useState('active');

  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('goodalarm_user');
    if (!userData) { navigate('/'); return; }
    const parsed = JSON.parse(userData);
    setUser(parsed);
    loadData(parsed.userId);
  }, [navigate]);

  const loadData = async (userId) => {
    setLoading(true);
    try {
      const [configRes, logsRes] = await Promise.all([
        getConfigApi(userId),
        getLogsApi(userId),
      ]);
      if (configRes?.success) setConfigs(configRes.configs || []);
      if (logsRes?.success)   setLogs(logsRes.logs || []);
    } catch {
      showMessage('error', '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 6000);
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    } catch { return dateStr; }
  };

  /* ─── 알람 테스트 ─── */
  const handleTestWebhook = async (conf) => {
    setActionLoading(prev => ({ ...prev, [conf.configId]: 'test' }));
    try {
      const res = await testWebhookApi(user.userId, conf.configId);
      showMessage(res?.success ? 'success' : 'error',
        res?.message || (res?.success ? '테스트 메시지를 발송했습니다!' : '웹훅 테스트 실패'));
      if (res?.success) loadData(user.userId);
    } catch {
      showMessage('error', '서버 통신 오류');
    } finally {
      setActionLoading(prev => ({ ...prev, [conf.configId]: null }));
    }
  };

  /* ─── 즉시 체크 ─── */
  const handleRunCheckNow = async (conf) => {
    setActionLoading(prev => ({ ...prev, [conf.configId]: 'check' }));
    try {
      const res = await runCheckNowApi(user.userId, conf.configId);
      showMessage(res?.success ? 'success' : 'error',
        res?.message || (res?.success ? '즉시 확인 완료!' : '즉시 확인 실패'));
      if (res?.success) loadData(user.userId);
    } catch {
      showMessage('error', '서버 통신 오류');
    } finally {
      setActionLoading(prev => ({ ...prev, [conf.configId]: null }));
    }
  };

  const requestDeleteConfig = (conf) => { setTargetToDelete(conf); setIsDeleteModalOpen(true); };

  const deleteConfig = async () => {
    if (!targetToDelete || !user) return;
    setIsDeleteModalOpen(false);
    setLoading(true);
    try {
      const res = await deleteConfigApi(user.userId, targetToDelete.configId);
      showMessage(res?.success ? 'success' : 'error', res?.message || '삭제 실패');
      if (res?.success) loadData(user.userId);
    } catch {
      showMessage('error', '서버 통신 오류');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => { localStorage.removeItem('goodalarm_user'); navigate('/'); };
  if (!user) return null;

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem' }}>

      {/* ── 헤더 ── */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1.5rem 2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--primary)' }}>Good Alarm 통합관리</h1>
          <p style={{ margin: 0 }}>환영합니다, {user.team} {user.name}님</p>
        </div>
        <button onClick={logout} className="btn btn-secondary"><LogOut size={18} /> 로그아웃</button>
      </header>

      {/* ── 토스트 메시지 ── */}
      {message.text && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '1rem 2rem', borderRadius: '8px', maxWidth: '90vw', textAlign: 'center',
          background: message.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          color: message.type === 'error' ? '#B91C1C' : '#065F46',
          boxShadow: 'var(--shadow-md)', fontWeight: 'bold'
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>

        {/* ── 알람 설정 목록 ── */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings color="var(--primary)" />
              <h2 style={{ margin: 0 }}>알람 설정 목록</h2>
            </div>
            <button onClick={() => navigate('/config')} className="btn" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Plus size={16} /> 추가하기
            </button>
          </div>

          {/* 탭 */}
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
            {[['active', '진행 중'], ['expired', '만료됨']].map(([key, label]) => (
              <button key={key} onClick={() => setConfigTab(key)} style={{
                background: 'none', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer',
                fontWeight: configTab === key ? 'bold' : 'normal',
                color: configTab === key ? (key === 'active' ? 'var(--primary)' : '#B91C1C') : 'var(--text-muted)',
                borderBottom: configTab === key ? `2px solid ${key === 'active' ? 'var(--primary)' : '#B91C1C'}` : 'none'
              }}>{label}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {(() => {
              const displayConfigs = configs.filter(conf => {
                const isExpired = conf.endDate && conf.endDate < todayStr;
                return configTab === 'active' ? !isExpired : isExpired;
              });

              if (displayConfigs.length === 0) return (
                <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
                  <p>{configTab === 'active' ? '등록된 진행 중 알람이 없습니다.' : '만료된 알람 설정이 없습니다.'}</p>
                </div>
              );

              return (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {displayConfigs.map(conf => {
                    const isActing = actionLoading[conf.configId];
                    return (
                      <li key={conf.configId} style={{
                        padding: '1.25rem',
                        background: 'rgba(255,255,255,0.7)',
                        border: '1px solid var(--surface-border)',
                        borderRadius: '10px',
                        opacity: configTab === 'expired' ? 0.7 : 1
                      }}>
                        {/* 제목 + 수정/삭제 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.05rem' }}>{conf.name}</h3>
                          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                            <button onClick={() => navigate('/config', { state: { config: conf } })} className="btn btn-secondary" style={{ padding: '0.4rem' }} title="수정">
                              <Edit2 size={15} color="var(--primary)" />
                            </button>
                            <button onClick={() => requestDeleteConfig(conf)} className="btn btn-secondary" style={{ padding: '0.4rem' }} title="삭제">
                              <Trash2 size={15} color="#B91C1C" />
                            </button>
                          </div>
                        </div>

                        {/* 기간 / 알람 범위 */}
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.9rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Calendar size={13} />
                            <span>기간: {conf.startDate && conf.endDate
                              ? `${formatDateLabel(conf.startDate)} ~ ${formatDateLabel(conf.endDate)}`
                              : conf.startDate ? `${formatDateLabel(conf.startDate)} 부터`
                              : conf.endDate   ? `${formatDateLabel(conf.endDate)} 까지`
                              : '상시 운영'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Bell size={13} />
                            <span>알람 범위: {conf.weekdaysOnly ? '평일 전용 (주야/휴일 무관)' : '상시 (주야/휴일 무관)'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Zap size={13} color={conf.formTriggerId ? '#10B981' : '#F59E0B'} />
                            <span style={{ color: conf.formTriggerId ? '#065F46' : '#92400E', fontWeight: 600 }}>
                              {conf.formTriggerId ? '⚡ 즉시 알람 활성화' : '⚠️ 즉시 알람 미설정 (추가 후 자동 설치됨)'}
                            </span>
                          </div>
                        </div>

                        {/* 액션 버튼 */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {/* 웹훅 테스트 */}
                          <button
                            onClick={() => handleTestWebhook(conf)}
                            disabled={!!isActing}
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                            title="구글 챗으로 테스트 메시지 발송"
                          >
                            {isActing === 'test'
                              ? <RefreshCw size={14} className="spin-icon" />
                              : <Wifi size={14} />}
                            {isActing === 'test' ? '발송 중...' : '웹훅 테스트'}
                          </button>

                          {/* 즉시 확인 */}
                          <button
                            onClick={() => handleRunCheckNow(conf)}
                            disabled={!!isActing}
                            className="btn"
                            style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', background: '#10B981' }}
                            title="지금 즉시 새 응답을 확인하고 발송"
                          >
                            {isActing === 'check'
                              ? <RefreshCw size={14} className="spin-icon" />
                              : <Zap size={14} />}
                            {isActing === 'check' ? '확인 중...' : '지금 즉시 확인'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        </section>

        {/* ── 최근 알람 기록 ── */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity color="var(--primary)" />
              <h2 style={{ margin: 0 }}>최근 알람 기록</h2>
            </div>
            <button onClick={() => loadData(user.userId)} className="btn btn-secondary" style={{ padding: '0.5rem' }} title="새로고침">
              <RefreshCw size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {loading ? (
              <p style={{ textAlign: 'center', marginTop: '2rem' }}>기록을 불러오는 중...</p>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
                <Bell size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                <p>아직 발송된 알람 기록이 없습니다.<br />위 목록에서 <strong>웹훅 테스트</strong>를 눌러 연결을 확인하세요.</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {logs.map((log, idx) => {
                  const isSuccess = log.message.includes('성공') || log.message.includes('테스트');
                  const isError   = log.message.includes('실패') || log.message.includes('오류');
                  return (
                    <li key={idx} style={{
                      padding: '0.9rem 1rem',
                      background: isSuccess ? 'rgba(209,250,229,0.5)' : isError ? 'rgba(254,226,226,0.5)' : 'rgba(255,255,255,0.5)',
                      border: `1px solid ${isSuccess ? '#A7F3D0' : isError ? '#FECACA' : 'var(--surface-border)'}`,
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        {new Date(log.timestamp).toLocaleString('ko-KR')}
                      </div>
                      <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: isError ? '#B91C1C' : 'var(--text-main)' }}>
                        {log.message}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ── 삭제 확인 모달 ── */}
      {isDeleteModalOpen && targetToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '400px', maxWidth: '90%', padding: '2rem', textAlign: 'center' }}>
            <Trash2 size={48} color="#B91C1C" style={{ marginBottom: '1rem' }} />
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>정말 삭제하시겠습니까?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              <strong>{targetToDelete.name}</strong> 알람 설정이 삭제됩니다.<br />
              즉시 알람 트리거도 함께 제거됩니다.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setIsDeleteModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>취소</button>
              <button onClick={deleteConfig} className="btn" style={{ flex: 1, background: '#B91C1C' }}>삭제하기</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin-icon { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .glass-panel { padding: 1.25rem; }
          div[style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
