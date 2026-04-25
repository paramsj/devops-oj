import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { ensureRuntimeImages, executeCode } from './runner.js';

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS for testing from our HTML file
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "POST");
        return res.sendStatus(200);
    }
    next();
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or Supabase Key in .env file.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Endpoint to fetch all problems
app.get('/api/problems', async (req, res) => {
    try {
        const { data, error } = await supabase.from('problems').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to create a problem
app.post('/api/problems', async (req, res) => {
    try {
        const { title, description } = req.body;
        const { data, error } = await supabase.from('problems').insert({ title, description }).select().single();
        if (error) throw error;
        
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to add a test case to a problem
app.post('/api/problems/:id/testcases', async (req, res) => {
    try {
        const problem_id = req.params.id;
        const { input, expected_output, is_sample } = req.body;
        
        const { data, error } = await supabase.from('testcases').insert({ 
            problem_id, 
            input: input || '', 
            expected_output: expected_output || '', 
            is_sample: !!is_sample 
        }).select().single();
        
        if (error) throw error;
        
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to fetch sample testcases for a specific problem
app.get('/api/problems/:id/sample-testcases', async (req, res) => {
    try {
        const problem_id = req.params.id;
        const { data, error } = await supabase
            .from('testcases')
            .select('id, input, expected_output')
            .eq('problem_id', problem_id)
            .eq('is_sample', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Immediate feedback execute endpoint (e.g. "Run Code")
app.post('/api/execute', async (req, res) => {
    try {
        const { problem_id, language, code } = req.body;
        
        if (!['cpp', 'c++', 'python'].includes(language)) {
            return res.status(400).json({ error: "Unsupported language" });
        }

        // Fetch sample testcases only
        const { data: testcases, error } = await supabase
            .from('testcases')
            .select('*')
            .eq('problem_id', problem_id)
            .eq('is_sample', true)
            .order('id', { ascending: true });
            
        if (error) throw error;
        if (!testcases || testcases.length === 0) {
            return res.status(400).json({ error: "No sample testcases found for this problem." });
        }

        // Execute code
        const executionData = await executeCode(language, code, testcases);
        res.json(executionData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Final submission endpoint (e.g. "Submit")
app.post('/api/submit', async (req, res) => {
    try {
        const { problem_id, language, code, user_id } = req.body;

        if (!['cpp', 'c++', 'python'].includes(language)) {
            return res.status(400).json({ error: "Unsupported language" });
        }

        // Fetch all test cases
        const { data: testcases, error } = await supabase
            .from('testcases')
            .select('*')
            .eq('problem_id', problem_id)
            .order('id', { ascending: true });
            
        if (error) throw error;
        if (!testcases || testcases.length === 0) {
            return res.status(400).json({ error: "No testcases found for this problem." });
        }

        // Run isolated docker execution
        const executionData = await executeCode(language, code, testcases);
        
        // Compute overall verdict based on executed test cases
        let finalVerdict = 'AC';
        if (executionData.status === 'CE') {
            finalVerdict = 'CE'; // Compilation Error
        } else {
            const { results } = executionData;
            // Since execution halts on TLE/RE/WA, the last result dictates failure, 
            // or if we stopped early, then a failure must have occurred.
            if (results && results.length > 0) {
                const lastStatus = results[results.length - 1].status;
                if (lastStatus !== 'AC') {
                    finalVerdict = lastStatus; 
                }
            } else {
                finalVerdict = 'RE'; // Stopped immediately before any results? Assume RE.
            }
        }

        // Save submission record
        const { data: submission, error: subError } = await supabase.from('submissions').insert({
            problem_id,
            user_id: user_id || null, // Optional, depending on user auth setup
            language,
            code,
            status: finalVerdict
        }).select().single();
        
        if (subError) throw subError;

        // Optionally, save detailed test case limits to `submission_results`
        if (executionData.results && executionData.results.length > 0) {
            const resultEntries = executionData.results.map(r => ({
                submission_id: submission.id,
                testcase_id: r.testcase_id,
                status: r.status,
                output: r.output
            }));
            
            const { error: resError } = await supabase.from('submission_results').insert(resultEntries);
            if (resError) console.error("Error inserting submission_results:", resError.message);
        }

        res.status(201).json({
            submission_id: submission.id,
            status: finalVerdict,
            details: executionData
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await ensureRuntimeImages();
    } catch (err) {
        console.error(`Failed to ensure runtime images: ${err.message}`);
        console.error('Code execution may fail until images are available.');
    }

    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

startServer();
