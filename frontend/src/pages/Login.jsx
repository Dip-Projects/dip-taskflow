import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import logo from '../assets/logo.png';
import './Login.css';

export default function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated && user) {
    const dept = (user.department || '').trim().toLowerCase();
    return <Navigate to={dept === 'site engineer' ? '/site' : '/app'} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const { path } = await login(username.trim(), password);
      navigate(path, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-page">
      <div className="lp-panel">
        <img src={logo} alt="DIP" className="lp-logo" />
        <h1 className="lp-brand">DIP TaskFlow</h1>
        <p className="lp-tagline">Tasks · Sites · Reports — one login</p>
      </div>
      <div className="lp-form-wrap">
        <form className="lp-card" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          <p className="lp-sub">Use your TaskFlow username and password</p>
          {error && <div className="lp-error">{error}</div>}
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={loading}
            />
          </label>
          <label>
            Password
            <div className="lp-pass-row">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="lp-eye"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <button type="submit" className="lp-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
