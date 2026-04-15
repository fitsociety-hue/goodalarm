import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfigApi, deleteConfigApi, getLogsApi, testWebhookApi, checkGasVersionApi, forceRescanApi,
         getBaseUrl, setBaseUrl, GAS_REQUIRED_VERSION } from '../services/api';
import { LogOut, RefreshCw, Bell, Settings, Activity, Plus, Edit2, Trash2,
         Calendar, Zap, Wifi, AlertTriangle, Check, Clock } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser]       = useState(null);
  const [configs, setConfigs] = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loadingAction, setLoadingAction] = useState({});
  const [gasOutdated, setGasOutdated] = useState(false);
  const [gasUrlInput, setGasUrlInput] = useState('');
  const [urlSaved, setUrlSaved]       = useState(false);
  const [configTab, setConfigTab]     = useState('active');
  const [lastRefresh, setLastRefresh] = useState(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [targetToDelete, setTargetToDelete]       = useState(null);

  const autoRefreshTimer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('goodalarm_user');
    if (!userData) { navigate('/'); return; }
    const parsed = JSON.parse(userData);
    setUser(parsed);
    setGasUrlInput(getBaseUrl());
    loadData(parsed.userId);
    checkGasVersion();

    // ★ 60초마다 로그 자동 새로고침
    autoRefreshTimer.current = setInterval(() => {
      loadLogs(parsed.userId);
    }, 60 * 1000);

    return () => { if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current); };
  }, [navigate]);

  const checkGasVersion = async () => {
    try {
      const res = await checkGasVersionApi();
      setGasOutdated(!res || !res.version || res.version < GAS_REQUIRED_VERSION);
    } catch { setGasOutdated(true); }
  };

  const saveGasUrl = async () => {
    if (!gasUrlInput.trim().includes('script.google.com')) {
      showMessage('error', '올바른 GAS URL이 아닙니다.');
      return;
    }
    setBaseUrl(gasUrlInput.trim());
    setUrlSaved(true);
    showMessage('success', '✅ URL이 저장되었습니다. GAS 버전을 다시 확인합니다...');
    setTimeout(async () => { await checkGasVersion(); setUrlSaved(false); }, 1500);
  };

  const loadData = async (userId) => {
    setLoading(true);
    try {
      const [configRes, logsRes] = await Promise.all([getConfigApi(userId), getLogsApi(userId)]);
      if (configRes?.success) setConfigs(configRes.configs || []);
      if (logsRes?.success)   setLogs(logsRes.logs || []);
      setLastRefresh(new Date());
    } catch { showMessage('error', '데이터를 불러오는데 실패했습니다.'); }
    finally { setLoading(false); }
  };

  const loadLogs = async (userId) => {
    try {
      const res = await getLogsApi(userId);
      if (res?.success) { setLogs(res.logs || []); setLastRefresh(new Date()); }
    } catch { /* silent */ }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 7000);
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

  /* ─── 웹훅 테스트 ─── */
  const handleTestWebhook = async (conf) => {
    setLoadingAction(prev => ({ ...prev, [`test_${conf.configId}`]: true }));
    try {
      const res = await testWebhookApi(user.userId, conf.configId);
      if (!res || (typeof res === 'object' && Object.keys(res).length === 0)) {
        setGasOutdated(true);
        showMessage('error', '⚠️ GAS 구버전! 아래 안내에서 새 배포를 진행해주세요.');
      } else {
        showMessage(res?.success ? 'success' : 'error', res?.message || '오류 발생');
        if (res?.success) loadData(user.userId);
      }
    } catch { showMessage('error', '서버 통신 오류'); }
    finally { setLoadingAction(prev => ({ ...prev, [`test_${conf.configId}`]: false })); }
  };

  /* ─── 강제 스캔(미수신 재발송) ─── */
  const handleForceRescan = async (conf) => {
    setLoadingAction(prev => ({ ...prev, [`rescan_${conf.configId}`]: true }));
    try {
      const res = await forceRescanApi(user.userId, conf.configId);
      if (!res || (typeof res === 'object' && Object.keys(res).length === 0)) {
        setGasOutdated(true);
        showMessage('error', '⚠️ GAS 구버전! GAS 버전 업데이트가 필요합니다.');
      } else {
        showMessage(res?.success ? 'success' : 'error', res?.message || '오류 발생');
        if (res?.success) loadData(user.userId);
      }
    } catch { showMessage('error', '서버 통신 오류'); }
    finally { setLoadingAction(prev => ({ ...prev, [`rescan_${conf.configId}`]: false })); }
  };

  const requestDeleteConfig = (conf) => { setTargetToDelete(conf); setIsDeleteModalOpen(true); };

  const deleteConfig = async () => {
    if (!targetToDelete || !user) return;
    setIsDeleteModalOpen(false); setLoading(true);
    try {
      const res = await deleteConfigApi(user.userId, targetToDelete.configId);
      showMessage(res?.success ? 'success' : 'error', res?.message || '삭제 실패');
      if (res?.success) loadData(user.userId);
    } catch { showMessage('error', '서버 통신 오류'); }
    finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem('goodalarm_user'); navigate('/'); };
  if (!user) return null;

  const todayStr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem' }}>

      {/* ── 헤더 ── */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '1.5rem 2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--primary)' }}>Good Alarm 통합관리</h1>
          <p style={{ margin: 0 }}>환영합니다, {user.team} {user.name}님</p>
        </div>
        <button onClick={logout} className="btn btn-secondary"><LogOut size={18} /> 로그아웃</button>
      </header>

      {/* ── GAS 배포 안내 배너 ── */}
      {gasOutdated && (
        <div style={{
          background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
          border: '2px solid #F59E0B', borderRadius: '12px',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <AlertTriangle size={24} color="#B45309" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#92400E', fontSize: '1rem', display: 'block', marginBottom: '0.5rem' }}>
                ⚠️ GAS v5.6 배포가 필요합니다
              </strong>
              <div style={{ color: '#78350F', fontSize: '0.875rem', lineHeight: '1.9' }}>
                <div>① <strong>GAS 편집기</strong>에 Code.gs 전체 붙여넣기 → <kbd style={{background:'#FDE68A', padding:'1px 6px', borderRadius:'3px', fontFamily:'monospace'}}>Ctrl+S</kbd> 저장</div>
                <div>② <strong>배포 → 배포관리 → ✏️ → 새 버전 → 배포</strong> 후 URL 복사</div>
                <div>③ GAS 에디터에서 <kbd style={{background:'#FDE68A', padding:'1px 6px', borderRadius:'3px', fontFamily:'monospace'}}>reinstallAllTriggers</kbd> 함수 직접 실행 (필수!)</div>
                <div>④ 아래에 새 배포 URL 붙여넣기 → 저장</div>
              </div>
            </div>
            <button onClick={() => setGasOutdated(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: '1.3rem' }}>✕</button>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold', color: '#92400E', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              ④ 새 GAS 배포 URL 입력
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text" value={gasUrlInput}
                onChange={e => { setGasUrlInput(e.target.value); setUrlSaved(false); }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="input-field"
                style={{ flex: 1, fontSize: '0.82rem', marginBottom: 0, padding: '0.6rem 0.75rem' }}
              />
              <button onClick={saveGasUrl} className="btn" style={{
                flexShrink: 0, padding: '0.6rem 1.25rem',
                background: urlSaved ? '#10B981' : '#D97706',
                display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 'bold'
              }}>
                {urlSaved ? <><Check size={15} /> 저장됨!</> : '저장 후 재확인'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {displayConfigs.map(conf => (
                    <li key={conf.configId} style={{
                      padding: '1.25rem',
                      background: 'rgba(255,255,255,0.7)',
                      border: '1px solid var(--surface-border)',
                      borderRadius: '10px',
                      opacity: configTab === 'expired' ? 0.7 : 1
                    }}>
                      {/* 설정 이름 + 수정/삭제 */}
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

                      {/* 설정 세부 */}
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.9rem' }}>
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
                          <span>알람 범위: {conf.weekdaysOnly ? '평일 전용' : '상시 (주야/휴일 무관)'}</span>
                        </div>
                        {/* ★ 즉시알람 상태 배지 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <Zap size={13} color="#10B981" />
                          <span style={{ color: '#065F46', fontWeight: 600 }}>⚡ 즉시 알람 활성화 (폼 제출 즉시 + 1분 폴링 백업)</span>
                        </div>
                      </div>

                      {/* ★ 웹훅 테스트 / 강제스캔 버튼 */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                        <button
                          id={`test-webhook-${conf.configId}`}
                          onClick={() => handleTestWebhook(conf)}
                          disabled={!!loadingAction[`test_${conf.configId}`]}
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                        >
                          {loadingAction[`test_${conf.configId}`]
                            ? <><RefreshCw size={14} className="spin-icon" /> 발송 중</>
                            : <><Wifi size={14} /> 연결 테스트</>}
                        </button>
                        <button
                          onClick={() => handleForceRescan(conf)}
                          disabled={!!loadingAction[`rescan_${conf.configId}`]}
                          className="btn"
                          style={{ flex: 1, background: '#D97706', fontSize: '0.85rem', padding: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                          title="최근 데이터 알람을 받지 못한 경우 클릭하세요"
                        >
                          {loadingAction[`rescan_${conf.configId}`]
                            ? <><RefreshCw size={14} className="spin-icon" /> 스캔 예약 중</>
                            : <><RefreshCw size={14} /> 최신 누락 1건 재발송</>}
                        </button>
                      </div>
                    </li>
                  ))}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {lastRefresh && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={12} />
                  {lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 갱신
                </span>
              )}
              <button
                onClick={() => user && loadData(user.userId)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
                title="새로고침"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>
          </div>

          {/* 자동 새로고침 안내 */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RefreshCw size={11} /> 1분마다 자동 새로고침
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {loading ? (
              <p style={{ textAlign: 'center', marginTop: '2rem' }}>기록을 불러오는 중...</p>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
                <Bell size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                <p>
                  {gasOutdated
                    ? <strong style={{ color: '#B45309' }}>위 노란 안내에서 GAS를 업데이트해주세요.</strong>
                    : '아직 발송된 알람 기록이 없습니다.'}
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {logs.map((log, idx) => {
                  const isSuccess = log.message.includes('성공');
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
              <strong>{targetToDelete.name}</strong> 알람 설정이 삭제됩니다.
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
