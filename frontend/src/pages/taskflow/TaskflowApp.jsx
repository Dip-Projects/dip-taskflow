import { useEffect, useState, memo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import TaskflowDom from './TaskflowDom';
import { mountTaskflowApp } from './mountTaskflowApp';
import TaskflowReactShell from './react/TaskflowReactShell';
import './taskflow.css';
import '../SurfaceToggle.css';

/** Prevent React from wiping legacy-filled #navList on parent re-renders */
const StableTaskflowDom = memo(TaskflowDom, () => true);

/**
 * Office TaskFlow: React phase-1 shell by default; Classic (legacy) on demand.
 */
export default function TaskflowApp() {
  const { user, token, isAuthenticated, logout, canToggleSite } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('react'); // 'react' | 'classic'

  useEffect(() => {
    if (!isAuthenticated || mode !== 'classic') return;

    let cancelled = false;
    let tries = 0;

    const tryMount = async () => {
      await new Promise((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      if (!document.getElementById('navList') || !document.getElementById('appScreen')) {
        tries += 1;
        if (tries < 10) setTimeout(tryMount, 50);
        else console.error('[TaskflowApp] TaskflowDom never appeared');
        return;
      }

      try {
        await mountTaskflowApp({
          getToken: () => localStorage.getItem('tf_token') || token,
          getUser: () => {
            try {
              return JSON.parse(localStorage.getItem('tf_user') || 'null') || user;
            } catch {
              return user;
            }
          },
          onLogout: () => {
            logout();
            navigate('/login', { replace: true });
          },
        });
      } catch (err) {
        console.error('[TaskflowApp] mount failed', err);
      }
    };

    tryMount();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, mode, token, user, logout, navigate]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const dept = (user?.department || '').trim().toLowerCase();
  if (dept === 'site engineer' && !canToggleSite) {
    return <Navigate to="/site" replace />;
  }

  const goSite = () => {
    localStorage.setItem('tf_surface', 'site');
    navigate('/site');
  };

  return (
    <div className="tf-shell">
      {canToggleSite && (
        <div className="tf-surface-bar">
          <span className="tf-surface-label">Switch view</span>
          <div className="tf-surface-toggle">
            <button type="button" className="active" disabled>
              Office
            </button>
            <button type="button" onClick={goSite}>
              Switch to Site
            </button>
          </div>
          <button
            type="button"
            className="tf-surface-logout"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Logout
          </button>
        </div>
      )}
      <div
        id="tf-react-root"
        className="tf-legacy-frame"
        style={{ overflow: 'auto', height: '100%' }}
      >
        {mode === 'react' ? (
          <TaskflowReactShell onOpenClassic={() => setMode('classic')} />
        ) : (
          <>
            <div style={{ padding: '8px 12px', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
              <button type="button" onClick={() => setMode('react')}>
                ← Back to React TaskFlow
              </button>
            </div>
            <StableTaskflowDom />
          </>
        )}
      </div>
    </div>
  );
}
