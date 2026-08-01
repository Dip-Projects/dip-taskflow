import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { postLoginPath } from './lib/api';
import Login from './pages/Login';
import TaskflowApp from './pages/TaskflowApp';
import SiteApp from './pages/SiteApp';
import ClientApp from './pages/ClientApp';

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  return <Navigate to={postLoginPath(user)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/app/*"
            element={
              <RequireAuth>
                <TaskflowApp />
              </RequireAuth>
            }
          />
          <Route
            path="/site/*"
            element={
              <RequireAuth>
                <SiteApp />
              </RequireAuth>
            }
          />
          <Route
            path="/client/*"
            element={
              <RequireAuth>
                <ClientApp />
              </RequireAuth>
            }
          />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
