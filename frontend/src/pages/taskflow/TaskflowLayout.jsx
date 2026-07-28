import { useState } from 'react';
import './taskflow.css';

const LOGO_URL =
  'https://drive.google.com/thumbnail?id=10FeV3emPMe-VCvGni66b2DOzNIPM3mGp&sz=w40';

/**
 * App shell: topbar + sidebar + main. Element IDs match legacy app.js so
 * mountTaskflowApp can drive nav/user chrome when used with TaskflowDom.
 *
 * When navSections is provided, React renders the sidebar; otherwise leave
 * #navList empty for the legacy bridge to fill.
 */
export default function TaskflowLayout({
  userName = '—',
  userRole = '—',
  onLogout,
  navSections,
  activeView,
  onNavigate,
  badges = {},
  headSurfaceToggle = null,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  const handleNav = (key) => {
    onNavigate?.(key);
    closeSidebar();
  };

  return (
    <div className="tf-layout-root">
      {headSurfaceToggle}
      <section id="appScreen" className="screen app-screen">
        <header className="topbar">
          <button
            id="menuToggle"
            type="button"
            className="icon-btn"
            aria-label="Toggle menu"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            ☰
          </button>
          <div className="topbar-brand">
            <img
              src={LOGO_URL}
              alt="Logo"
              className="topbar-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextElementSibling) {
                  e.currentTarget.nextElementSibling.style.display = 'flex';
                }
              }}
            />
            <span className="topbar-mark" style={{ display: 'none' }}>
              DP
            </span>
            <span className="topbar-name">DIP Projects</span>
          </div>
          <div className="topbar-user">
            <div className="topbar-user-info">
              <div className="topbar-user-namerow">
                <strong id="userName">{userName}</strong>
                <span id="userRoleTag" className="role-tag">
                  {userRole}
                </span>
              </div>
              <span className="topbar-tagline">
                Quality + Quantity to be delivered on time every time
              </span>
            </div>
            <button id="logoutBtn" type="button" className="logout-btn" onClick={onLogout}>
              ↩ Log out
            </button>
          </div>
        </header>

        <div className="app-body">
          <aside id="sidebar" className={`sidebar${sidebarOpen ? ' open' : ''}`}>
            <nav id="navList" className="nav-list">
              {Array.isArray(navSections) &&
                navSections.map((section) => (
                  <div key={section.label || section.key}>
                    {section.label && (
                      <div className="nav-section-label">{section.label}</div>
                    )}
                    {(section.items || []).map((item) => {
                      const badge = badges[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`nav-btn${activeView === item.key ? ' active' : ''}`}
                          data-view={item.key}
                          onClick={() => handleNav(item.key)}
                        >
                          <span>{item.label}</span>
                          {badge != null && badge !== 0 && (
                            <span className="nav-badge">{badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
            </nav>
          </aside>
          <div
            id="sidebarOverlay"
            className="sidebar-overlay"
            hidden={!sidebarOpen}
            onClick={closeSidebar}
          />
          <main id="mainContent" className="main-content">
            {children}
          </main>
        </div>
      </section>
    </div>
  );
}
