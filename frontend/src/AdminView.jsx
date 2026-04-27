import React, { useEffect, useMemo, useState } from 'react';
import { Settings, PlusCircle, Database, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminView() {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE || 'http://localhost:3000', []);

  const [problems, setProblems] = useState([]);
  const [tcProblem, setTcProblem] = useState('');

  const [problemTitle, setProblemTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');

  const [tcInput, setTcInput] = useState('');
  const [tcExpected, setTcExpected] = useState('');
  const [tcSample, setTcSample] = useState('true');

  const [problemStatus, setProblemStatus] = useState('');
  const [problemStatusOk, setProblemStatusOk] = useState(false);

  const [tcStatus, setTcStatus] = useState('');
  const [tcStatusOk, setTcStatusOk] = useState(false);

  useEffect(() => {
    loadProblems();
  }, []);

  async function parseResponse(response) {
    const text = await response.text();
    try {
      return { text, parsed: JSON.parse(text) };
    } catch {
      return { text, parsed: text };
    }
  }

  async function loadProblems() {
    try {
      const r = await fetch(`${apiBase}/api/problems`);
      const { parsed } = await parseResponse(r);

      if (!r.ok || !Array.isArray(parsed)) {
        throw new Error('Failed to load problem list from API');
      }

      setProblems(parsed);
      setTcProblem((prev) => prev || parsed[0]?.id || '');
    } catch (err) {
      setProblems([]);
      setTcProblem('');
    }
  }

  async function createProblem() {
    const title = problemTitle.trim();
    const description = problemDescription.trim();

    if (!title || !description) {
      setProblemStatusOk(false);
      setProblemStatus('Title and description are required.');
      return;
    }

    try {
      const r = await fetch(`${apiBase}/api/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description })
      });

      const { parsed } = await parseResponse(r);
      if (!r.ok) {
        throw new Error(parsed?.error || 'Problem creation failed');
      }

      setProblemStatusOk(true);
      setProblemStatus(`Problem '${title}' created successfully.`);
      setProblemTitle('');
      setProblemDescription('');

      await loadProblems();
    } catch (err) {
      setProblemStatusOk(false);
      setProblemStatus(err.message);
    }
  }

  async function createTestcase() {
    if (!tcProblem) {
      setTcStatusOk(false);
      setTcStatus('Please select a target problem.');
      return;
    }

    try {
      const r = await fetch(`${apiBase}/api/problems/${tcProblem}/testcases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: tcInput,
          expected_output: tcExpected,
          is_sample: tcSample === 'true'
        })
      });

      const { parsed } = await parseResponse(r);
      if (!r.ok) {
        throw new Error(parsed?.error || 'Testcase creation failed');
      }

      setTcStatusOk(true);
      setTcStatus(`Testcase created successfully (${tcSample === 'true' ? 'Sample' : 'Hidden'}).`);
      setTcInput('');
      setTcExpected('');
    } catch (err) {
      setTcStatusOk(false);
      setTcStatus(err.message);
    }
  }

  return (
    <div className="admin-container">
      <div style={{ marginBottom: '2rem' }}>

        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.8rem' }}>
          <Settings color="#a855f7" />
          Admin Dashboard
        </h2>
        <p className="muted-text">Manage problems, test cases, and platform settings.</p>
      </div>

      <div className="admin-grid">
        {/* Create Problem Card */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <PlusCircle size={20} color="#6366f1" />
            Create Problem
          </h3>
          <p className="muted-text">Add a new coding challenge to the platform.</p>

          <label>Problem Title</label>
          <input
            value={problemTitle}
            onChange={(e) => setProblemTitle(e.target.value)}
            placeholder="e.g. Sum Two Numbers"
          />

          <label>Description / Statement (Markdown supported)</label>
          <textarea
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            rows="8"
            placeholder="Write a program that takes two integers and prints their sum..."
          />

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={createProblem} style={{ flex: 1, justifyContent: 'center' }}>
              Create Problem
            </button>
            <button className="btn btn-secondary" onClick={loadProblems}>
              <Database size={16} />
            </button>
          </div>

          {problemStatus && (
            <div className={`status-msg ${problemStatusOk ? 'success' : 'error'}`}>
              {problemStatusOk ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              {problemStatus}
            </div>
          )}
        </div>

        {/* Create Testcase Card */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Database size={20} color="#10b981" />
            Add Testcase
          </h3>
          <p className="muted-text">Attach sample or hidden test cases to an existing problem.</p>

          <label>Target Problem</label>
          <select value={tcProblem} onChange={(e) => setTcProblem(e.target.value)}>
            {problems.length === 0 ? (
              <option value="">No problems found</option>
            ) : (
              problems.map((p) => (
                <option key={p.id} value={p.id} style={{ color: '#000' }}>
                  {p.title}
                </option>
              ))
            )}
          </select>

          <label>Input Data</label>
          <textarea
            value={tcInput}
            onChange={(e) => setTcInput(e.target.value)}
            rows="3"
            placeholder="1&#10;2"
          />

          <label>Expected Output</label>
          <textarea
            value={tcExpected}
            onChange={(e) => setTcExpected(e.target.value)}
            rows="3"
            placeholder="3"
          />

          <label>Testcase Visibility</label>
          <select value={tcSample} onChange={(e) => setTcSample(e.target.value)}>
            <option value="true" style={{ color: '#000' }}>Sample (Visible to users)</option>
            <option value="false" style={{ color: '#000' }}>Hidden (For evaluation only)</option>
          </select>

          <button className="btn btn-success" onClick={createTestcase} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
            Save Testcase
          </button>

          {tcStatus && (
            <div className={`status-msg ${tcStatusOk ? 'success' : 'error'}`}>
              {tcStatusOk ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              {tcStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
