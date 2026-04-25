import React from 'react';
import { useMemo, useState } from 'react';
import RunnerView from './RunnerView';
import AdminView from './AdminView';

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
    <main className="container">
      <h2> Simple Online Judge </h2>
      <div className="card nav-card">
        <button
          className={`nav-btn ${tab === 'runner' ? 'active' : ''}`}
          onClick={() => setActiveTab('runner')}
        >
          Runner
        </button>
        <button
          className={`nav-btn ${tab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          Admin
        </button>
      </div>

      {tab === 'runner' ? <RunnerView /> : <AdminView />}
    </main>
  );
}
