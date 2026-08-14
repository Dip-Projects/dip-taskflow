import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo.png";
import "./Navbar.css";

export default function Navbar({ onMenuToggle, menuOpen, onLogout }) {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isClientLogin =
    String(authUser?.role || "").toLowerCase() === "client" ||
    String(authUser?.department || "").toLowerCase() === "client";
  const displayRole = isClientLogin
    ? "Client"
    : (authUser?.designation || authUser?.role || "");
  const user = authUser
    ? {
        name: authUser.full_name || authUser.name,
        role: displayRole,
        designation: isClientLogin ? "Client" : authUser.designation,
        department: authUser.department,
      }
    : null;
  const portalName = isClientLogin
    ? "Client Portal"
    : /process controller/i.test(displayRole)
      ? "Process Controller"
      : user?.role
        ? `${user.role}`
        : "Employee Portal";

  const confirmLogout = () => {
    setShowLogoutModal(false);
    // Clear AuthContext + localStorage so Login does not bounce back to /site
    if (typeof onLogout === "function") onLogout();
    else {
      logout();
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      {/* ── Logout Confirmation Modal ── */}
      {showLogoutModal && (
        <div className="logout-backdrop" onClick={() => setShowLogoutModal(false)}>
          <div className="logout-modal" onClick={e => e.stopPropagation()}>

            <div className="logout-modal-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>

            <div className="logout-modal-title">Sign Out?</div>
            <div className="logout-modal-sub">
              You'll be returned to the login screen. Any unsaved changes will be lost.
            </div>

            {user && (
              <div className="logout-modal-user">
                <div className="logout-modal-avatar">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="logout-modal-uname">{user.name}</div>
                  <div className="logout-modal-urole">{user.role || user.designation || ""}</div>
                </div>
              </div>
            )}

            <div className="logout-modal-btns">
              <button className="logout-btn-cancel" onClick={() => setShowLogoutModal(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Cancel
              </button>
              <button className="logout-btn-confirm" onClick={confirmLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Yes, Sign Out
              </button>
            </div>

          </div>
        </div>
      )}

      <nav className="app-navbar">
        <div className="navbar-left">
          {onMenuToggle && (
            <button className="navbar-ham" onClick={onMenuToggle} aria-label="Toggle sidebar">
              {menuOpen
                ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              }
            </button>
          )}
          <img src={logo} alt="Logo" className="navbar-logo" />
          <div className="navbar-brand-text">
            <div className="navbar-title">{portalName}</div>
            <div className="navbar-tagline">Quality + Quantity · On Time · Every Time</div>
          </div>
        </div>

        <div className="navbar-right">
          {user && (
            <>
              <div className="navbar-divider"/>
              <div className="navbar-user">
                <div className="navbar-avatar">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <div className="navbar-user-info">
                  <div className="navbar-user-name">{user.name}</div>
                  <div className="navbar-user-role">{user.role || user.designation || ""}</div>
                </div>
              </div>
              <div className="navbar-divider"/>
            </>
          )}
          <button className="navbar-logout" onClick={() => setShowLogoutModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}