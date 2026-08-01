import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { postLoginPath } from './lib/api';
import Login from './pages/Login';

const TaskflowApp = lazy(() => import('./pages/TaskflowApp'));
const SiteApp = lazy(() => import('./pages/SiteApp'));
const ClientApp = lazy(() => import('./pages/ClientApp'));

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

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#6b2d0f',
        background: '#f5f0eb',
      }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
