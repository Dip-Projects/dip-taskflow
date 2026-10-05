import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { syncSiteUser, canToggleMdo } from '../lib/api';
import MDOPortal from './mdo/MDOPortal';
import './SurfaceToggle.css';

export default function MdoApp() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) syncSiteUser(user);
  }, [user]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if ((user?.role || '').toLowerCase() === 'client' || (user?.department || '').toLowerCase() === 'client') {
    return <Navigate to="/client" replace />;
  }

  if (!canToggleMdo(user)) {
    return <Navigate to="/app" replace />;
  }

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const goOffice = () => {
    localStorage.setItem('tf_surface', 'app');
    navigate('/app');
  };

  return (
    <div className="site-shell site-theme">
      <div className="tf-surface-bar">
        <span className="tf-surface-label">Switch view</span>
        <div className="tf-surface-toggle">
          <button type="button" className="active" disabled>
            MDO
          </button>
          <button type="button" onClick={goOffice}>
            Office
          </button>
        </div>
      </div>
      <div className="site-shell-body">
        <MDOPortal onLogout={doLogout} />
      </div>
    </div>
  );
}
