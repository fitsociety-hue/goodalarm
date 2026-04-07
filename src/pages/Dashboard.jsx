import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfigApi, updateConfigApi, getLogsApi } from '../services/api';
import { LogOut, Save, RefreshCw, Bell, Settings, Activity } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ sheetUrl: '', chatWebhook: '', tracking: false });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
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
        setConfig({
          sheetUrl: configRes.sheetUrl || '',
          chatWebhook: configRes.chatWebhook || '',
          tracking: configRes.tracking || false
        });
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
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const saveConfig = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await updateConfigApi(user.userId, config.sheetUrl, config.chatWebhook);
      if (res && res.success) {
        showMessage('success', '설정이 저장되었습니다.');
        loadData(user.userId);
      } else {
        showMessage('error', res.message || '저장 실패');
      }
    } catch (err) {
      showMessage('error', '서버 통신 오류');
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('goodalarm_user');
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="container animate-fade-in">
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
          padding: '1rem', borderRadius: '8px', marginBottom: '2rem',
          background: message.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          color: message.type === 'error' ? '#B91C1C' : '#065F46',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
        <section className="glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Settings color="var(--primary)" />
            <h2 style={{ margin: 0 }}>알람 설정</h2>
          </div>

          <div className="input-group">
            <label htmlFor="sheetUrl">모니터링할 구글 스프레드시트 URL</label>
            <input 
              type="text" 
              id="sheetUrl" 
              name="sheetUrl" 
              className="input-field" 
              placeholder="https://docs.google.com/spreadsheets/d/..." 
              value={config.sheetUrl} 
              onChange={handleConfigChange} 
            />
            <small style={{ color: 'var(--text-muted)' }}>응답이 기록되는 시트의 전체 주소를 입력하세요.</small>
          </div>

          <div className="input-group">
            <label htmlFor="chatWebhook">구글 챗 웹훅(Webhook) URL</label>
            <input 
              type="text" 
              id="chatWebhook" 
              name="chatWebhook" 
              className="input-field" 
              placeholder="https://chat.googleapis.com/v1/spaces/..." 
              value={config.chatWebhook} 
              onChange={handleConfigChange} 
            />
            <small style={{ color: 'var(--text-muted)' }}>스페이스 설정에서 생성한 웹훅 주소를 입력하세요.</small>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge ${config.tracking ? 'badge-active' : 'badge-inactive'}`}>
                {config.tracking ? '모니터링 활성화됨' : '설정 미완료'}
              </span>
            </div>
            <button onClick={saveConfig} className="btn" disabled={saving}>
              {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />} 저장하기
            </button>
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
                <p>아직 발송된 알람 기록이 없습니다.<br/>설정을 완료하고 첫 번째 알람을 기다려보세요!</p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {logs.map((log, idx) => (
                  <li key={idx} style={{ 
                    padding: '1rem', 
                    background: 'rgba(255,255,255,0.5)', 
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
