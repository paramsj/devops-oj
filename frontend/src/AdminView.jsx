import React from 'react';
import { useEffect, useMemo, useState } from 'react';

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
  const [problemResponse, setProblemResponse] = useState('');

  const [tcStatus, setTcStatus] = useState('');
  const [tcStatusOk, setTcStatusOk] = useState(false);
  const [tcResponse, setTcResponse] = useState('');

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
      setProblemStatusOk(true);
      setProblemStatus(`Loaded ${parsed.length} problem(s).`);
    } catch (err) {
      setProblems([]);
      setTcProblem('');
      setProblemStatusOk(false);
      setProblemStatus(`Problem load failed: ${err.message}`);
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
      setProblemStatus('Problem created successfully.');
      setProblemResponse(JSON.stringify(parsed, null, 2));
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
      setTcStatus(`Testcase created (${tcSample === 'true' ? 'sample' : 'hidden'}).`);
      setTcResponse(JSON.stringify(parsed, null, 2));
      setTcInput('');
      setTcExpected('');
    } catch (err) {
      setTcStatusOk(false);
      setTcStatus(err.message);
    }
  }

  return (
    <>
      <div className="card">
        <h3>Create Problem</h3>
        <p className="muted">Equivalent curl: POST /api/problems</p>

        <label>Title</label>
        <input
          value={problemTitle}
          onChange={(e) => setProblemTitle(e.target.value)}
          placeholder="e.g. Sum Two Numbers"
        />

        <label>Description / Statement</label>
        <textarea
          value={problemDescription}
          onChange={(e) => setProblemDescription(e.target.value)}
          rows="6"
          placeholder="Write a program that..."
        />

        <button className="submit-btn" onClick={createProblem}>Create Problem</button>
        <button className="secondary-btn" onClick={loadProblems}>Reload Problem List</button>

        {problemStatus ? <div className={`status ${problemStatusOk ? 'ok' : 'err'}`}>{problemStatus}</div> : null}
        {problemResponse ? <pre>{problemResponse}</pre> : null}
      </div>

      <div className="card">
        <h3>Create Testcase</h3>
        <p className="muted">Equivalent curl: POST /api/problems/:id/testcases</p>

        <label>Target Problem</label>
        <select value={tcProblem} onChange={(e) => setTcProblem(e.target.value)}>
          {problems.length === 0 ? (
            <option value="">No problems found</option>
          ) : (
            problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.id})
              </option>
            ))
          )}
        </select>

        <label>Input</label>
        <textarea value={tcInput} onChange={(e) => setTcInput(e.target.value)} rows="4" placeholder={'1\n2'} />

        <label>Expected Output</label>
        <textarea value={tcExpected} onChange={(e) => setTcExpected(e.target.value)} rows="4" placeholder="3" />

        <label>Type</label>
        <select value={tcSample} onChange={(e) => setTcSample(e.target.value)}>
          <option value="true">Sample testcase</option>
          <option value="false">Hidden testcase</option>
        </select>

        <button className="submit-btn" onClick={createTestcase}>Create Testcase</button>

        {tcStatus ? <div className={`status ${tcStatusOk ? 'ok' : 'err'}`}>{tcStatus}</div> : null}
        {tcResponse ? <pre>{tcResponse}</pre> : null}
      </div>
    </>
  );
}
