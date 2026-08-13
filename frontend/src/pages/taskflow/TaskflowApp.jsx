import { useEffect, memo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import TaskflowDom from './TaskflowDom';
import { mountTaskflowApp } from './mountTaskflowApp';
import './taskflow.css';
import '../SurfaceToggle.css';

/** Prevent React from wiping legacy-filled #navList on parent re-renders */
const StableTaskflowDom = memo(TaskflowDom, () => true);

/**
 * Office TaskFlow: Classic UI (same look as before).
 */
export default function TaskflowApp() {
  const { user, token, isAuthenticated, logout, canToggleSite } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [isAuthenticated, token, user, logout, navigate]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const dept = (user?.department || '').trim().toLowerCase();
  if (dept === 'site engineer' && !canToggleSite) {
    return <Navigate to="/site" replace />;
  }
  if ((user?.role || '').toLowerCase() === 'client' || dept === 'client') {
    return <Navigate to="/client" replace />;
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
              Site
            </button>
          </div>
        </div>
      )}
      <div
        id="tf-react-root"
        className="tf-legacy-frame"
        style={{ overflow: 'auto', height: '100%' }}
      >
        <StableTaskflowDom />
      </div>
    </div>
  );
}
