import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { postLoginPath } from '../lib/api';
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
  const [info, setInfo] = useState('');

  if (isAuthenticated && user) {
    return <Navigate to={postLoginPath(user)} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
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
        <div className="lp-panel-inner">
          <img src={logo} alt="DIP Projects" className="lp-panel-logo" />
          <div className="lp-panel-name">DIP Projects</div>
          <div className="lp-panel-tagline">Civil Project Management Consultants</div>
          <div className="lp-panel-divider" />
          <div className="lp-panel-quote">
            &ldquo;Quality + Quantity to be Delivered on Time Every Time .&rdquo;
          </div>
        </div>
      </div>

      <div className="lp-form-side">
        <form className="lp-card" onSubmit={onSubmit}>
          <div className="lp-mobile-brand">
            <img src={logo} alt="DIP Projects" className="lp-mobile-logo" />
            <div>
              <div className="lp-mobile-name">DIP Projects</div>
              <div className="lp-mobile-sub">Civil Project Management</div>
            </div>
          </div>

          <div className="lp-heading">DIP Projects </div>
          <div className="lp-subheading">
            Sign in to access project intelligence, reporting, and collaboration tools.
          </div>

          {error && (
            <div className="lp-alert lp-alert-error">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
          {info && (
            <div className="lp-alert lp-alert-info">{info}</div>
          )}

          <div className="lp-field">
            <label className="lp-label" htmlFor="lp-username">Username</label>
            <div className="lp-input-wrap">
              <svg className="lp-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="lp-username"
                className="lp-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          <div className="lp-field">
            <label className="lp-label" htmlFor="lp-password">Password</label>
            <div className="lp-input-wrap">
              <svg className="lp-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="lp-password"
                className="lp-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="lp-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="lp-btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span className="lp-spinner" /> Signing in…
              </>
            ) : (
              <>
                Sign In
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </>
            )}
          </button>

          <button
            type="button"
            className="lp-forgot-link"
            onClick={() =>
              setInfo('Please contact your admin to reset your password.')
            }
          >
            Forgot your password?
          </button>

          <div className="lp-footer">
            © {new Date().getFullYear()} DIP Projects · All rights reserved
          </div>
        </form>
      </div>
    </div>
  );
}
