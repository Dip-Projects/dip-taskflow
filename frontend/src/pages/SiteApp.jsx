import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { syncSiteUser } from '../lib/api';
import SitePortal from './site/SitePortal';
import './SurfaceToggle.css';

export default function SiteApp() {
  const { user, isAuthenticated, logout, canToggleSite, isSiteEngineer } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) syncSiteUser(user);
  }, [user]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Only site engineers and heads (can_access_site / is_head) may open /site
  if (!isSiteEngineer && !canToggleSite) {
    return <Navigate to="/app" replace />;
  }

  const goApp = () => {
    localStorage.setItem('tf_surface', 'app');
    navigate('/app');
  };

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="site-shell">
      {canToggleSite && (
        <div className="tf-surface-bar">
          <span className="tf-surface-label">Switch view</span>
          <div className="tf-surface-toggle">
            <button type="button" onClick={goApp}>
              Switch to Office
            </button>
            <button type="button" className="active" disabled>
              Site
            </button>
          </div>
          <button type="button" className="tf-surface-logout" onClick={doLogout}>
            Logout
          </button>
        </div>
      )}
      <div className="site-shell-body">
        <SitePortal />
      </div>
    </div>
  );
}
