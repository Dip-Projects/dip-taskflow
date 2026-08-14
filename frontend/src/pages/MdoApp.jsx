import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { syncSiteUser, isProcessController } from '../lib/api';
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

  if (!isProcessController(user)) {
    return <Navigate to="/app" replace />;
  }

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="site-shell">
      <div className="site-shell-body">
        <MDOPortal onLogout={doLogout} />
      </div>
    </div>
  );
}
