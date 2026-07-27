import { useState } from 'react';
import { authApi } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (token: string, storeName: string) => void;
}

function Login({ onLogin }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = isRegister
        ? await authApi.register(name, password)
        : await authApi.login(name, password);

      onLogin(response.data.token, response.data.storeName);
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>南京亭</h1>
        <h2>{isRegister ? '店舗登録' : 'ログイン'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">店舗名</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '処理中...' : (isRegister ? '登録' : 'ログイン')}
          </button>
        </form>

        <button
          className="toggle-btn"
          onClick={() => setIsRegister(!isRegister)}
          disabled={loading}
        >
          {isRegister ? 'ログインに戻る' : '新しい店舗を登録'}
        </button>
      </div>
    </div>
  );
}

export default Login;