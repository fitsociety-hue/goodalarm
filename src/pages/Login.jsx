import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi, registerApi, getBaseUrl, setBaseUrl } from '../services/api';
import { LogIn, UserPlus, Settings, Check, X } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', team: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // GAS URL 설정 패널
  const [showUrlPanel, setShowUrlPanel] = useState(false);
  const [gasUrlInput, setGasUrlInput]   = useState('');
  const [urlSaved, setUrlSaved]         = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('goodalarm_user')) navigate('/dashboard');
    setGasUrlInput(getBaseUrl());
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'password' && value.length > 4) return;
    if (name === 'password' && !/^\d*$/.test(value)) return;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.team || formData.password.length !== 4) {
      setError('모든 필드를 올바르게 입력해주세요 (비밀번호 숫자 4자리).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = isLogin
        ? await loginApi(formData.name, formData.team, formData.password)
        : await registerApi(formData.name, formData.team, formData.password);

      if (response && response.success) {
        localStorage.setItem('goodalarm_user', JSON.stringify({
          userId: response.userId, name: response.name, team: response.team
        }));
        navigate('/dashboard');
      } else {
        setError(response?.message || '오류가 발생했습니다.');
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const saveGasUrl = () => {
    if (!gasUrlInput.trim().includes('script.google.com')) {
      setError('올바른 GAS URL을 입력해주세요. (script.google.com 포함)');
      return;
    }
    setBaseUrl(gasUrlInput.trim());
    setUrlSaved(true);
    setError('');
    setTimeout(() => setUrlSaved(false), 3000);
  };

  return (
    <div className="flex-center min-h-screen">
      <div className="glass-panel animate-fade-in" style={{ width: '440px', maxWidth: '95%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: 'var(--primary)' }}>Good Alarm</h1>
          <p>강동어울림복지관 자동 알람 시스템</p>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="name">이름</label>
            <input type="text" id="name" name="name" className="input-field" placeholder="홍길동" value={formData.name} onChange={handleChange} required />
          </div>
          <div className="input-group">
            <label htmlFor="team">팀명</label>
            <input type="text" id="team" name="team" className="input-field" placeholder="기획팀" value={formData.team} onChange={handleChange} required />
          </div>
          <div className="input-group">
            <label htmlFor="password">비밀번호 (숫자 4자리)</label>
            <input type="password" id="password" name="password" className="input-field" placeholder="1234" value={formData.password} onChange={handleChange} required />
          </div>
          <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? '처리 중...' : isLogin ? <><LogIn size={20} /> 로그인</> : <><UserPlus size={20} /> 회원가입</>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {isLogin ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          </span>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', marginLeft: '0.5rem', cursor: 'pointer' }}
          >
            {isLogin ? '회원가입' : '로그인'}
          </button>
        </div>

        {/* ── GAS URL 설정 패널 ── */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
          <button
            type="button"
            onClick={() => setShowUrlPanel(!showUrlPanel)}
            style={{
              width: '100%', background: 'none', border: '1px solid var(--surface-border)',
              borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              color: 'var(--text-muted)', fontSize: '0.85rem',
              transition: 'all 0.2s'
            }}
          >
            <Settings size={15} />
            GAS API URL 설정 {showUrlPanel ? '▲' : '▼'}
          </button>

          {showUrlPanel && (
            <div style={{
              marginTop: '1rem', padding: '1rem',
              background: 'rgba(255,255,255,0.5)', borderRadius: '8px',
              border: '1px solid var(--surface-border)'
            }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                GAS를 새로 배포했다면 여기에 <strong>새 배포 URL</strong>을 붙여넣으세요.<br />
                <span style={{ color: '#B45309' }}>⚠️ URL은 <code>/exec</code>로 끝나야 합니다.</span>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={gasUrlInput}
                  onChange={e => { setGasUrlInput(e.target.value); setUrlSaved(false); }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="input-field"
                  style={{ flex: 1, fontSize: '0.78rem', marginBottom: 0, padding: '0.5rem' }}
                />
                <button
                  type="button"
                  onClick={saveGasUrl}
                  className="btn"
                  style={{
                    padding: '0.5rem 1rem', flexShrink: 0, minWidth: '70px',
                    background: urlSaved ? '#10B981' : 'var(--primary)',
                    display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem'
                  }}
                >
                  {urlSaved ? <><Check size={14} /> 저장됨!</> : '저장'}
                </button>
              </div>
              {urlSaved && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#065F46', fontWeight: 'bold' }}>
                  ✅ URL이 저장되었습니다. 로그인을 진행하세요!
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
