import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { postLoginPath } from './lib/api';
import Login from './pages/Login';

// After a deploy the old index.html still points at chunk names that no longer
// exist, so the first navigation 404s and the screen stays blank. Reload once
// (guarded by sessionStorage) to pick up the new build.
function lazyChunk(loader) {
  const key = 'tf_chunk_reloaded';
  return lazy(() =>
    loader()
      .then((mod) => {
        sessionStorage.removeItem(key);
        return mod;
      })
      .catch((err) => {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
          return new Promise(() => {});
        }
        throw err;
      })
  );
}

const TaskflowApp = lazyChunk(() => import('./pages/TaskflowApp'));
const SiteApp = lazyChunk(() => import('./pages/SiteApp'));
const MdoApp = lazyChunk(() => import('./pages/MdoApp'));
const ClientApp = lazyChunk(() => import('./pages/ClientApp'));

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
              path="/mdo/*"
              element={
                <RequireAuth>
                  <MdoApp />
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
