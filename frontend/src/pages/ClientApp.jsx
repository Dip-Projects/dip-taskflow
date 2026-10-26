import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isClient, syncSiteUser } from '../lib/api';
import { useEffect } from 'react';
import ClientPortal from './client/ClientPortal';

export default function ClientApp() {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (user) syncSiteUser(user);
  }, [user]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isClient(user)) return <Navigate to="/app" replace />;

  return <ClientPortal />;
}
