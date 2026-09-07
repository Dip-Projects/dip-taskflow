import { Navigate, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { syncSiteUser } from '../lib/api';
import SitePortal from './site/SitePortal';
import QrAttendance from './site/QrAttendance';
import './SurfaceToggle.css';

export default function SiteApp() {
  const { user, isAuthenticated, canToggleSite, canToggleMdo, isSiteEngineer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isQrScan = /\/site\/qr-scan\/?$/.test(location.pathname);

  useEffect(() => {
    if (user) syncSiteUser(user);
  }, [user]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if ((user?.role || '').toLowerCase() === 'client' || (user?.department || '').toLowerCase() === 'client') {
    return <Navigate to="/client" replace />;
  }

  if (canToggleMdo && !canToggleSite) {
    const last = localStorage.getItem('tf_surface');
    return <Navigate to={last === 'app' || last === 'office' ? '/app' : '/mdo'} replace />;
  }

  // Only site engineers and heads (can_access_site / is_head) may open /site
  if (!isSiteEngineer && !canToggleSite) {
    return <Navigate to="/app" replace />;
  }

  const goApp = () => {
    localStorage.setItem('tf_surface', 'app');
    navigate('/app');
  };

  return (
    <div className="site-shell site-theme">
      {canToggleSite && !isQrScan && (
        <div className="tf-surface-bar">
          <span className="tf-surface-label">Switch view</span>
          <div className="tf-surface-toggle">
            <button type="button" onClick={goApp}>
              Office
            </button>
            <button type="button" className="active" disabled>
              Site
            </button>
          </div>
        </div>
      )}
      <div className="site-shell-body">
        <Routes>
          <Route path="qr-scan" element={<QrAttendance />} />
          <Route path="*" element={<SitePortal />} />
        </Routes>
      </div>
    </div>
  );
}
