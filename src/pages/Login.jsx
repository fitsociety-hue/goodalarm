import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi, registerApi } from '../services/api';
import { LogIn, UserPlus } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', team: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem('goodalarm_user');
    if (user) {
      navigate('/dashboard');
    }
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
        localStorage.setItem('goodalarm_user', JSON.stringify({ userId: response.userId, name: response.name, team: response.team }));
        navigate('/dashboard');
      } else {
        setError(response.message || '오류가 발생했습니다.');
      }
    } catch (err) {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center min-h-screen">
      <div className="glass-panel animate-fade-in" style={{ width: '400px', maxWidth: '90%' }}>
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
            style={{ 
              background: 'none', border: 'none', color: 'var(--primary)', 
              fontWeight: '600', marginLeft: '0.5rem', cursor: 'pointer' 
            }}>
            {isLogin ? '회원가입' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
