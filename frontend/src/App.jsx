import React, { useMemo, useState } from 'react';
import RunnerView from './RunnerView';
import AdminView from './AdminView';
import { Code2, LayoutDashboard, Terminal } from 'lucide-react';

export default function App() {
  const initialTab = useMemo(() => {
    return window.location.hash === '#admin' ? 'admin' : 'runner';
  }, []);

  const [tab, setTab] = useState(initialTab);

  function setActiveTab(nextTab) {
    setTab(nextTab);
    window.location.hash = nextTab === 'admin' ? 'admin' : 'runner';
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="brand">
          <Terminal size={28} color="#ffffffff" />
          ProJudge
        </div>
        <div className="nav-links">
          <button
            className={`nav-btn ${tab === 'runner' ? 'active' : ''}`}
            onClick={() => setActiveTab('runner')}
          >
            <Code2 size={18} />
            Code Arena
          </button>
          <button
            className={`nav-btn ${tab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>
        </div>
      </nav>

      <div className="main-content">
        {tab === 'runner' ? <RunnerView /> : <AdminView />}
      </div>
    </div>
  );
}
