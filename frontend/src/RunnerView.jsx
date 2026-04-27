import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, UploadCloud, TerminalSquare, FileText, CheckCircle2 } from 'lucide-react';

const DEFAULT_CODE_PYTHON = `import sys
# Base starter code - prints exactly what it receives
data = sys.stdin.read()
print(data.strip())`;

const DEFAULT_CODE_CPP = `#include <iostream>
using namespace std;

int main() {
    // Write your solution here
    return 0;
}`;

export default function RunnerView() {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE || 'http://localhost:3000', []);

  const [problems, setProblems] = useState([]);
  const [problemId, setProblemId] = useState('');
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE_PYTHON);
  const [statement, setStatement] = useState('Select a problem to view its statement.');
  const [sampleTestcases, setSampleTestcases] = useState([]);
  const [sampleMessage, setSampleMessage] = useState('Select a problem to load sample test cases.');
  const [out, setOut] = useState('Waiting for code to run...');
  const [isRunning, setIsRunning] = useState(false);
  const [isError, setIsError] = useState(false);

  // New states for LeetCode-like bottom console
  const [activeTab, setActiveTab] = useState('testcases'); // 'testcases' or 'result'
  const [activeResultIndex, setActiveResultIndex] = useState(0); // Which test case is selected in the result tab
  const [executionResult, setExecutionResult] = useState(null);

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

  useEffect(() => {
    // When problem or language changes, load saved code from localStorage
    if (problemId) {
      const savedCode = localStorage.getItem(`saved_code_${problemId}_${language}`);
      if (savedCode) {
        setCode(savedCode);
      } else {
        setCode(language === 'python' ? DEFAULT_CODE_PYTHON : DEFAULT_CODE_CPP);
      }
    }
  }, [language, problemId]);

  function handleCodeChange(value) {
    const newCode = value || '';
    setCode(newCode);
    if (problemId) {
      localStorage.setItem(`saved_code_${problemId}_${language}`, newCode);
    }
  }

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
      setOut(`System initialized. Loaded ${data.length} problems.`);
      setIsError(false);
    } catch (e) {
      setOut(`Fetch Error: ${e.message}`);
      setIsError(true);
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
      setIsError(true);
      return;
    }

    setOut('Compiling and executing code in secure container...');
    setIsRunning(true);
    setIsError(false);

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
      
      const actualDetails = result.details || result;
      setExecutionResult(result);
      setActiveTab('result');
      setActiveResultIndex(0);

      // Determine if error based on status
      if (result.status && result.status !== 'AC' && result.status !== 'SUCCESS') {
          setIsError(true);
      } else if (actualDetails.status === 'CE') {
          setIsError(true);
      } else {
          setIsError(false);
      }
      
      setOut(JSON.stringify(result, null, 2));
    } catch (e) {
      setExecutionResult({ status: 'CE', error: e.message });
      setActiveTab('result');
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  }

  const selectedProblemTitle = problems.find(p => p.id === problemId)?.title || 'No Problem Selected';

  // Helper to get detailed results
  const renderTestResult = () => {
    if (!executionResult) return <div className="muted-text" style={{padding: '1rem'}}>Run your code to see results here.</div>;
    
    const details = executionResult.details || executionResult;

    if (details.status === 'CE') {
      return (
        <div className="test-result-panel error-panel">
          <h4 style={{ color: '#ef4444' }}>Compilation Error</h4>
          <pre className="console-output error">{details.error}</pre>
        </div>
      );
    }

    const overallStatus = executionResult.status || details.status;
    const resultsList = details.results || [];

    let isAC = false;
    let displayStatus = overallStatus;

    if (overallStatus === 'SUCCESS' || overallStatus === 'AC' || overallStatus === 'Accepted') {
      if (resultsList.length > 0) {
        const failedCase = resultsList.find(r => r.status !== 'AC');
        if (failedCase) {
          isAC = false;
          displayStatus = failedCase.status === 'WA' ? 'Wrong Answer' : 
                          failedCase.status === 'TLE' ? 'Time Limit Exceeded' : 
                          failedCase.status === 'RE' ? 'Runtime Error' : failedCase.status;
        } else {
          isAC = true;
          displayStatus = 'Accepted';
        }
      } else if (overallStatus !== 'SUCCESS') { // If no results but explicitly AC
        isAC = true;
        displayStatus = 'Accepted';
      }
    } else {
      isAC = false;
      displayStatus = overallStatus === 'WA' ? 'Wrong Answer' : overallStatus;
    }

    return (
      <div className="test-result-panel">
        <h4 style={{ color: isAC ? '#10b981' : '#ef4444', marginBottom: '1rem', fontSize: '1.2rem' }}>
          {displayStatus}
        </h4>
        
        {resultsList.length > 0 && (
          <>
            <div className="result-tabs">
              {resultsList.map((res, idx) => (
                <button 
                  key={idx}
                  className={`result-tab-btn ${activeResultIndex === idx ? 'active' : ''}`}
                  onClick={() => setActiveResultIndex(idx)}
                >
                  {res.status === 'AC' ? (
                    <span style={{ color: '#10b981' }}>• Case {idx + 1}</span>
                  ) : (
                    <span style={{ color: '#ef4444' }}>• Case {idx + 1}</span>
                  )}
                </button>
              ))}
            </div>
            
            {resultsList[activeResultIndex] && (
              <div className="result-details">
                <div className="result-io-group">
                  <label>Status</label>
                  <div className={`status-badge ${resultsList[activeResultIndex].status === 'AC' ? 'ac' : 'wa'}`}>
                    {resultsList[activeResultIndex].status}
                  </div>
                </div>
                
                {/* Find original testcase to show expected/input if possible */}
                {(() => {
                  const tcId = resultsList[activeResultIndex].testcase_id;
                  const originalTc = sampleTestcases.find(t => t.id === tcId);
                  if (originalTc) {
                    return (
                      <>
                        <div className="result-io-group">
                          <label>Input</label>
                          <pre className="io-box">{originalTc.input}</pre>
                        </div>
                        <div className="result-io-group">
                          <label>Expected Output</label>
                          <pre className="io-box">{originalTc.expected_output}</pre>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}

                <div className="result-io-group">
                  <label>Actual Output / Error</label>
                  <pre className="io-box">{resultsList[activeResultIndex].output || 'No output'}</pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="split-pane">
      {/* Left Pane - Problem Info */}
      <div className="left-pane">
        <div className="pane-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
            <FileText size={18} color="#94a3b8" />
            <select 
              value={problemId} 
              onChange={(e) => setProblemId(e.target.value)}
              style={{ margin: 0, padding: '0.4rem', width: 'auto', flex: 1, background: 'transparent', border: 'none', fontWeight: '600', fontSize: '1rem', color: '#fff' }}
            >
              {problems.length === 0 ? (
                <option value="">No problems found!</option>
              ) : (
                problems.map((p) => (
                  <option key={p.id} value={p.id} style={{color: '#000'}}>
                    {p.title}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        
        <div className="pane-content">
          <div className="problem-meta">
            <span className="badge">Time Limit: 2.0s</span>
            <span className="badge">Memory Limit: 256MB</span>
          </div>
          
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>{selectedProblemTitle}</h2>
          
          <div className="problem-statement">
            {statement}
          </div>
        </div>
      </div>

      {/* Right Pane - Editor & Console */}
      <div className="right-pane">
        <div className="editor-container">
          <div className="editor-header">
            <select 
              className="lang-select" 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="python">Python (3.10)</option>
              <option value="cpp">C++ (GCC 11)</option>
            </select>
            
            <div className="action-bar">
              <button 
                className="btn btn-secondary" 
                onClick={() => exec('/api/execute')}
                disabled={isRunning}
              >
                <Play size={16} />
                Run Code
              </button>
              <button 
                className="btn btn-success" 
                onClick={() => exec('/api/submit')}
                disabled={isRunning}
              >
                <UploadCloud size={16} />
                Submit
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              theme="vs-dark"
              language={language === 'python' ? 'python' : 'cpp'}
              value={code}
              onChange={handleCodeChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'Fira Code', monospace",
                lineHeight: 24,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                formatOnPaste: true
              }}
            />
          </div>
        </div>

        {/* Execution Console Tabs */}
        <div className="console-panel">
          <div className="console-tabs-header">
            <button 
              className={`console-tab ${activeTab === 'testcases' ? 'active' : ''}`}
              onClick={() => setActiveTab('testcases')}
            >
              <CheckCircle2 size={14} /> Testcases
            </button>
            <button 
              className={`console-tab ${activeTab === 'result' ? 'active' : ''}`}
              onClick={() => setActiveTab('result')}
            >
              <FileText size={14} /> Test Result
            </button>
            <button 
              className={`console-tab ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveTab('raw')}
            >
              <TerminalSquare size={14} /> Raw Output
            </button>
            {isRunning && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: '0.85rem', paddingRight: '1rem' }}>Running...</span>}
          </div>
          
          <div className="console-tab-content">
            {activeTab === 'testcases' && (
              <div className="testcase-grid" style={{ padding: '1rem' }}>
                {sampleTestcases.length === 0 ? (
                  <div className="muted-text">{sampleMessage}</div>
                ) : (
                  sampleTestcases.map((tc, idx) => (
                    <div key={tc.id || idx} className="testcase-item">
                      <div className="testcase-header">
                        Test Case {idx + 1}
                      </div>
                      <div className="testcase-body">
                        <div className="testcase-io">
                          <span>Input</span>
                          <pre>{tc.input || ''}</pre>
                        </div>
                        <div className="testcase-io">
                          <span>Expected Output</span>
                          <pre>{tc.expected_output || ''}</pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {activeTab === 'result' && renderTestResult()}

            {activeTab === 'raw' && (
              <pre className={`console-output ${isError ? 'error' : 'success'}`} style={{ padding: '1rem' }}>
                {out}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
