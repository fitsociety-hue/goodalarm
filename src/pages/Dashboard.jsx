import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfigApi, addConfigApi, updateConfigApi, deleteConfigApi, getLogsApi } from '../services/api';
import { LogOut, Save, RefreshCw, Bell, Settings, Activity, Plus, Edit2, Trash2, Calendar, X } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState(null);
  const [currentConfig, setCurrentConfig] = useState({
    configId: '', name: '', sheetUrl: '', chatWebhook: '', startDate: '', endDate: '', weekdaysOnly: false
  });

  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('goodalarm_user');
    if (!userData) {
      navigate('/');
    } else {
      const parsed = JSON.parse(userData);
      setUser(parsed);
      loadData(parsed.userId);
    }
  }, [navigate]);

  const loadData = async (userId) => {
    setLoading(true);
    try {
      const configRes = await getConfigApi(userId);
      if (configRes && configRes.success) {
        setConfigs(configRes.configs || []);
      }
      
      const logsRes = await getLogsApi(userId);
      if (logsRes && logsRes.success) {
        setLogs(logsRes.logs || []);
      }
    } catch (err) {
      showMessage('error', '데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentConfig(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    // If it's already YYYY-MM-DD, just return it.
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      // Convert to KST (+9) to securely display the correct calendar day
      const kstTime = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return kstTime.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  };

  const openAddModal = () => {
    setCurrentConfig({ configId: '', name: '', sheetUrl: '', chatWebhook: '', startDate: '', endDate: '', weekdaysOnly: false });
    setIsModalOpen(true);
  };

  const openEditModal = (config) => {
    setCurrentConfig({ ...config });
    setIsModalOpen(true);
  };

  const saveConfig = async () => {
    if (!user) return;
    if (!currentConfig.name || !currentConfig.sheetUrl || !currentConfig.chatWebhook) {
      showMessage('error', '알람 이름, 스프레드시트 URL, 웹훅 URL을 모두 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      let res;
      if (currentConfig.configId) {
        res = await updateConfigApi(user.userId, currentConfig.configId, currentConfig);
      } else {
        res = await addConfigApi(user.userId, currentConfig);
      }

      if (res && res.success) {
        showMessage('success', '설정이 저장되었습니다.');
        setIsModalOpen(false);
        loadData(user.userId);
      } else {
        if (res && Object.keys(res).length === 0) {
           showMessage('error', '🚫 구글 앱스 스크립트 배포가 실패했습니다! 옛날 코드가 실행되고 있습니다. Code.gs를 복사/붙여넣기 후 다시 "새 배포" 해주세요.');
        } else {
           showMessage('error', res.message || '저장 실패');
        }
      }
    } catch (err) {
      showMessage('error', '서버 통신 오류');
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteConfig = (config) => {
    setTargetToDelete(config);
    setIsDeleteModalOpen(true);
  };

  const deleteConfig = async () => {
    if (!targetToDelete || !user) return;
    setIsDeleteModalOpen(false);
    setLoading(true);
    try {
      const res = await deleteConfigApi(user.userId, targetToDelete.configId);
      if (res && res.success) {
        showMessage('success', '삭제되었습니다.');
        loadData(user.userId);
      } else {
        showMessage('error', res.message || '삭제 실패');
      }
    } catch (err) {
      showMessage('error', '서버 통신 오류');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('goodalarm_user');
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1.5rem 2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--primary)' }}>Good Alarm 통합관리</h1>
          <p style={{ margin: 0 }}>환영합니다, {user.team} {user.name}님</p>
        </div>
        <button onClick={logout} className="btn btn-secondary">
          <LogOut size={18} /> 로그아웃
        </button>
      </header>

      {message.text && (
        <div style={{ 
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '1rem 2rem', borderRadius: '8px',
          background: message.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          color: message.type === 'error' ? '#B91C1C' : '#065F46',
          boxShadow: 'var(--shadow-md)', fontWeight: 'bold'
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings color="var(--primary)" />
              <h2 style={{ margin: 0 }}>알람 설정 목록</h2>
            </div>
            <button onClick={openAddModal} className="btn" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Plus size={16} /> 추가하기
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {configs.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
                <p>등록된 알람 설정이 없습니다.<br/>새로운 알람을 추가해보세요!</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {configs.map((conf) => (
                  <li key={conf.configId} style={{ 
                    padding: '1.25rem', 
                    background: 'rgba(255,255,255,0.7)', 
                    border: '1px solid var(--surface-border)',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>{conf.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <Calendar size={14} /> 
                        <span>기간: {conf.startDate && conf.endDate ? `${formatDateLabel(conf.startDate)} ~ ${formatDateLabel(conf.endDate)}` : conf.startDate ? `${formatDateLabel(conf.startDate)} 부터` : conf.endDate ? `${formatDateLabel(conf.endDate)} 까지` : '상시 운영'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                        <Bell size={14} /> 
                        <span>알람 범위: {conf.weekdaysOnly ? '평일 전용 (주말 건은 월요일 오전 9시 발송)' : '상시 (주야/휴일 무관)'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => openEditModal(conf)} className="btn btn-secondary" style={{ padding: '0.5rem' }} title="수정">
                        <Edit2 size={16} color="var(--primary)" />
                      </button>
                      <button onClick={() => requestDeleteConfig(conf)} className="btn btn-secondary" style={{ padding: '0.5rem' }} title="삭제">
                        <Trash2 size={16} color="#B91C1C" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
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
                <p>아직 발송된 알람 기록이 없습니다.</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {logs.map((log, idx) => (
                  <li key={idx} style={{ 
                    padding: '1rem', 
                    background: 'rgba(255,255,255,0.7)', 
                    border: '1px solid var(--surface-border)',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {log.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '500px', maxWidth: '90%', padding: '2rem', position: 'relative' }}>
            <button onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={24} color="var(--text-muted)" />
            </button>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--primary)' }}>
              {currentConfig.configId ? '알람 설정 수정' : '새 알람 설정 추가'}
            </h2>
            
            <div className="input-group">
              <label htmlFor="name">알람 시스템 이름 (구분용)</label>
              <input type="text" id="name" name="name" className="input-field" placeholder="예: 2026 복지관 만족도 조사" value={currentConfig.name} onChange={handleConfigChange} required />
            </div>

            <div className="input-group">
              <label htmlFor="sheetUrl">모니터링할 구글 스프레드시트 URL</label>
              <input type="text" id="sheetUrl" name="sheetUrl" className="input-field" placeholder="https://docs.google.com/spreadsheets/d/..." value={currentConfig.sheetUrl} onChange={handleConfigChange} required />
            </div>

            <div className="input-group">
              <label htmlFor="chatWebhook">구글 챗 웹훅(Webhook) URL</label>
              <input type="text" id="chatWebhook" name="chatWebhook" className="input-field" placeholder="https://chat.googleapis.com/v1/spaces/..." value={currentConfig.chatWebhook} onChange={handleConfigChange} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label htmlFor="startDate">시작일 (선택)</label>
                <input type="date" id="startDate" name="startDate" className="input-field" value={currentConfig.startDate} onChange={handleConfigChange} />
              </div>
              <div className="input-group">
                <label htmlFor="endDate">종료일 (선택)</label>
                <input type="date" id="endDate" name="endDate" className="input-field" value={currentConfig.endDate} onChange={handleConfigChange} />
              </div>
            </div>
            
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="checkbox" id="weekdaysOnly" name="weekdaysOnly" checked={currentConfig.weekdaysOnly} onChange={handleConfigChange} style={{ width: '16px', height: '16px' }} />
              <label htmlFor="weekdaysOnly" style={{ margin: 0, cursor: 'pointer' }}>평일(월~금)에만 알람 받기</label>
            </div>
            
            <small style={{ display: 'block', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>시작일/종료일 지정시 해당 기간에만 동작합니다.<br/>평일만 알람 받기 체크 시: 주말 신청 건은 월요일 오전 9시에 일괄 발송됩니다.</small>

            <button onClick={saveConfig} className="btn" style={{ width: '100%' }} disabled={saving}>
              {saving ? <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto' }} /> : <><Save size={20} /> 저장하기</>}
            </button>
          </div>
        </div>
      )}
      
      {isDeleteModalOpen && targetToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '400px', maxWidth: '90%', padding: '2rem', textAlign: 'center' }}>
            <Trash2 size={48} color="#B91C1C" style={{ marginBottom: '1rem' }} />
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-main)' }}>정말 삭제하시겠습니까?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
              <strong>{targetToDelete.name}</strong> 알람 설정이 삭제됩니다.<br/>
              이 작업은 되돌릴 수 없으며, 기존 알람 발송 기록도 화면에서 숨겨집니다.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={() => setIsDeleteModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                취소
              </button>
              <button onClick={deleteConfig} className="btn" style={{ flex: 1, background: '#B91C1C', color: 'white' }}>
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .glass-panel { padding: 1.5rem; }
          div[style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
