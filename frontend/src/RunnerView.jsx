import React from 'react';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_CODE = `import sys
# Base starter code - prints exactly what it receives
data = sys.stdin.read()
print(data.strip())`;

export default function RunnerView() {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE || 'http://localhost:3000', []);

  const [problems, setProblems] = useState([]);
  const [problemId, setProblemId] = useState('');
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE);
  const [statement, setStatement] = useState('Select a problem to view its statement.');
  const [sampleTestcases, setSampleTestcases] = useState([]);
  const [sampleMessage, setSampleMessage] = useState('Select a problem to load sample test cases.');
  const [out, setOut] = useState('Waiting for code to run...');

  useEffect(() => {
    loadProblems();
  }, []);

  useEffect(() => {
    if (!problemId) {
      setStatement('Select a problem to view its statement.');
      setSampleMessage('Select a problem to load sample test cases.');
      setSampleTestcases([]);
      return;
    }

    const selected = problems.find((p) => p.id === problemId);
    setStatement(selected?.description || 'No description available for this problem.');
    loadSampleTestcases(problemId);
  }, [problemId, problems]);

  async function loadProblems() {
    try {
      const r = await fetch(`${apiBase}/api/problems`);
      const data = await r.json();

      if (!Array.isArray(data) || data.length === 0) {
        setProblems([]);
        setProblemId('');
        setStatement('No problem statement available.');
        setSampleMessage('No sample test cases available.');
        return;
      }

      setProblems(data);
      setProblemId((prev) => prev || data[0].id);
      setOut(`Successfully loaded ${data.length} problems!`);
    } catch (e) {
      setOut(`Fetch Error: ${e.message}`);
    }
  }

  async function loadSampleTestcases(id) {
    setSampleMessage('Loading sample test cases...');
    setSampleTestcases([]);

    try {
      const r = await fetch(`${apiBase}/api/problems/${id}/sample-testcases`);
      const contentType = r.headers.get('content-type') || '';

      if (!r.ok) {
        const bodyText = await r.text();
        const hint = bodyText.includes('Cannot GET')
          ? 'Endpoint missing on running server. Restart backend to load latest routes.'
          : bodyText.slice(0, 120);
        setSampleMessage(`Could not load sample test cases (HTTP ${r.status}). ${hint}`);
        return;
      }

      if (!contentType.includes('application/json')) {
        const bodyText = await r.text();
        setSampleMessage(
          `Could not load sample test cases: expected JSON, got ${contentType || 'unknown type'} (${bodyText.slice(0, 120)})`
        );
        return;
      }

      const testcases = await r.json();
      if (!Array.isArray(testcases) || testcases.length === 0) {
        setSampleMessage('No sample test cases available for this problem.');
        return;
      }

      setSampleTestcases(testcases);
      setSampleMessage('');
    } catch (e) {
      setSampleMessage(`Could not load sample test cases: ${e.message}`);
    }
  }

  async function exec(url) {
    if (!problemId) {
      setOut('Please select a valid problem first!');
      return;
    }

    setOut('Running code in isolated Docker container...');

    try {
      const r = await fetch(`${apiBase}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: problemId,
          language,
          code,
          user_id: null
        })
      });

      const result = await r.json();
      setOut(JSON.stringify(result, null, 2));
    } catch (e) {
      setOut(`Execution failed: ${e.message}`);
    }
  }

  return (
    <>
      <div className="card">
        <h3>1. Select a Problem</h3>
        <select value={problemId} onChange={(e) => setProblemId(e.target.value)}>
          {problems.length === 0 ? (
            <option value="">No problems found in Supabase Database!</option>
          ) : (
            problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="card">
        <h3>Problem Statement</h3>
        <div className="problem-statement">{statement}</div>
      </div>

      <div className="card">
        <h3>Sample Test Cases</h3>
        {sampleTestcases.length === 0 ? (
          <div>{sampleMessage}</div>
        ) : (
          sampleTestcases.map((tc, idx) => (
            <div key={tc.id || idx} className="sample-case">
              <h4>Sample #{idx + 1}</h4>
              <p>
                <strong>Input:</strong>
              </p>
              <pre>{tc.input || ''}</pre>
              <p>
                <strong>Expected Output:</strong>
              </p>
              <pre>{tc.expected_output || ''}</pre>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>2. Write Solution</h3>
        <label>
          <strong>Language:</strong>
        </label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="python">Python 3</option>
          <option value="cpp">C++ (GCC)</option>
        </select>

        <label>
          <strong>Code Editor:</strong>
        </label>
        <textarea rows="12" value={code} onChange={(e) => setCode(e.target.value)} />

        <button onClick={() => exec('/api/execute')}>▶ Run Code (Samples Only)</button>
        <button className="submit-btn" onClick={() => exec('/api/submit')}>
          ☁ Submit Solution (All Cases)
        </button>
      </div>

      <div className="card">
        <h3>3. Execution Results</h3>
        <pre>{out}</pre>
      </div>
    </>
  );
}
