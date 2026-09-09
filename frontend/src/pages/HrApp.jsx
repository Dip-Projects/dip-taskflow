import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isHr } from '../lib/api';
import HrPortal from './hr/HrPortal';

export default function HrApp() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const role = String(user?.role || '').toLowerCase();
  const allowed = role === 'admin' || isHr(user);
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const goOffice = () => {
    navigate('/app');
  };

  return (
    <HrPortal
      user={user}
      onLogout={doLogout}
      onOpenOffice={role === 'admin' ? goOffice : undefined}
    />
  );
}
