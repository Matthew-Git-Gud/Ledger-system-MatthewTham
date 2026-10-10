
import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Reconciliation from "./pages/Reconciliation";
import "./styles.css";

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const pages = {
    dashboard: {
      title: "Dashboard",
      component: <Dashboard />
    },
    reconciliation: {
      title: "Reconciliation",
      component: <Reconciliation />
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <strong>Ledger System</strong>
            <small>Financial Operations</small>
          </div>
        </div>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="nav-menu" aria-label="Main navigation">
          <button
            className={
              activePage === "dashboard" ? "nav-active" : ""
            }
            onClick={() => setActivePage("dashboard")}
          >
            <span>▦</span> Dashboard
          </button>

          <button
            className={
              activePage === "reconciliation" ? "nav-active" : ""
            }
            onClick={() => setActivePage("reconciliation")}
          >
            <span>◎</span> Reconciliation
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="online-dot" />
          Local Development
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <span>Workspace / {pages[activePage].title}</span>
          <span className="environment-label">DEMO ENVIRONMENT</span>
        </header>

        <div className="main-container">
          {pages[activePage].component}
        </div>
      </main>
    </div>
  );
}
