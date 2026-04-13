import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { addConfigApi, updateConfigApi } from '../services/api';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';

export default function ConfigForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // If we came from clicking "Edit", we pass the config in location.state
  const existingConfig = location.state?.config || null;

  const [currentConfig, setCurrentConfig] = useState(existingConfig || {
    configId: '', name: '', sheetUrl: '', chatWebhook: '', startDate: '', endDate: '', weekdaysOnly: false
  });

  useEffect(() => {
    const userData = localStorage.getItem('goodalarm_user');
    if (!userData) {
      navigate('/');
    } else {
      setUser(JSON.parse(userData));
    }
  }, [navigate]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentConfig(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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
        // Use history state to pass success message if needed, or simply navigate
        navigate('/dashboard');
      } else {
        if (res && Object.keys(res).length === 0) {
           showMessage('error', '🚫 구글 앱스 스크립트 배포가 실패했습니다! 옛날 코드가 실행되고 있습니다.');
        } else {
           showMessage('error', res?.message || '저장 실패');
        }
      }
    } catch (err) {
      showMessage('error', '서버 통신 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      
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

      <button 
        onClick={() => navigate('/dashboard')} 
        className="btn btn-secondary" 
        style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
      >
        <ArrowLeft size={18} /> 돌아가기
      </button>

      <section className="glass-panel" style={{ padding: '2.5rem' }}>
        <h2 style={{ top: 0, marginTop: 0, marginBottom: '2rem', color: 'var(--primary)', borderBottom: '2px solid var(--surface-border)', paddingBottom: '1rem' }}>
          {currentConfig.configId ? '알람 설정 수정' : '새 알람 설정 추가'}
        </h2>
        
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="name" style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>알람 시스템 이름 <span style={{color: '#B91C1C'}}>*</span></label>
            <input type="text" id="name" name="name" className="input-field" placeholder="예: 2026 복지관 만족도 조사" value={currentConfig.name} onChange={handleConfigChange} required />
            <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem' }}>목록에서 식별하기 위한 용도입니다.</small>
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sheetUrl" style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>모니터링할 구글 스프레드시트 URL <span style={{color: '#B91C1C'}}>*</span></label>
            <input type="text" id="sheetUrl" name="sheetUrl" className="input-field" placeholder="https://docs.google.com/spreadsheets/d/..." value={currentConfig.sheetUrl} onChange={handleConfigChange} required />
            <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem' }}>데이터가 수집되는 구글 폼 응답 스프레드시트 주소를 입력하세요.</small>
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="chatWebhook" style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>구글 챗 웹훅(Webhook) URL <span style={{color: '#B91C1C'}}>*</span></label>
            <input type="text" id="chatWebhook" name="chatWebhook" className="input-field" placeholder="https://chat.googleapis.com/v1/spaces/..." value={currentConfig.chatWebhook} onChange={handleConfigChange} required />
            <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem' }}>알람을 받을 구글 챗 스페이스의 웹훅 주소입니다.</small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label htmlFor="startDate" style={{ fontWeight: 'bold' }}>시작일 (선택)</label>
              <input type="date" id="startDate" name="startDate" className="input-field" value={currentConfig.startDate} onChange={handleConfigChange} />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label htmlFor="endDate" style={{ fontWeight: 'bold' }}>종료일 (선택)</label>
              <input type="date" id="endDate" name="endDate" className="input-field" value={currentConfig.endDate} onChange={handleConfigChange} />
            </div>
          </div>
          
          <div className="input-group glass-panel" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginTop: '1rem', padding: '1.5rem', background: 'rgba(255,255,255,0.4)', border: '1px solid var(--surface-border)' }}>
            <input type="checkbox" id="weekdaysOnly" name="weekdaysOnly" checked={currentConfig.weekdaysOnly} onChange={handleConfigChange} style={{ width: '20px', height: '20px', marginTop: '0.2rem', cursor: 'pointer' }} />
            <div>
              <label htmlFor="weekdaysOnly" style={{ margin: 0, cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)' }}>평일(월~금)에만 알람 받기</label>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                체크 시, 주말(토, 일)에 신청된 응답은 알람이 발송되지 않으며,<br/>
                <strong>월요일 오전 9시에 일괄적으로 취합되어 발송</strong>됩니다.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '3rem', display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary" style={{ flex: 1, padding: '1rem', fontSize: '1.1rem' }}>
            취소
          </button>
          <button onClick={saveConfig} className="btn" style={{ flex: 2, padding: '1rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} disabled={saving}>
            {saving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />} 
            {saving ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </section>

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
          div[style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
