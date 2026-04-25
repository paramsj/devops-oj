import Docker from 'dockerode';

const docker = new Docker(); // Connects to /var/run/docker.sock by default
const REQUIRED_IMAGES = ['python:3.10-slim', 'gcc:latest'];

function pullImage(image) {
    return new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }

            docker.modem.followProgress(stream, (followErr) => {
                if (followErr) {
                    reject(followErr);
                    return;
                }
                resolve();
            });
        });
    });
}

export async function ensureRuntimeImages() {
    for (const image of REQUIRED_IMAGES) {
        try {
            await docker.getImage(image).inspect();
            console.log(`Runtime image ready: ${image}`);
        } catch {
            console.log(`Runtime image missing, pulling: ${image}`);
            await pullImage(image);
            console.log(`Pulled runtime image: ${image}`);
        }
    }
}

/**
 * Executes a given code against a set of test cases in an isolated Docker container.
 * 
 * @param {string} language 'python' or 'cpp'
 * @param {string} code The source code to execute
 * @param {Array} testcases Array of testcase objects containing 'id', 'input', and 'expected_output'
 * @returns {Object} Execution report including overall status and individual testcase results
 */
export async function executeCode(language, code, testcases) {
    const isCpp = language === 'cpp' || language === 'c++';
    const image = isCpp ? 'gcc:latest' : 'python:3.10-slim';
    
    // Create an isolated container that stays alive using sleep.
    // We will 'exec' into it for compiling and running test cases.
    const container = await docker.createContainer({
        Image: image,
        Cmd: ['sleep', '3600'],
        NetworkDisabled: true,
        HostConfig: {
            Memory: 256 * 1024 * 1024, // 256MB Memory Limit
            PidsLimit: 30,             // Protect against fork bombs
        }
    });

    try {
        await container.start();

        if (isCpp) {
            // --- Compile Phase for C++ ---
            const compileExec = await container.exec({
                Cmd: ['sh', '-c', 'cat > main.cpp && g++ -O2 main.cpp -o main'],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true
            });
            const compileStream = await compileExec.start({ hijack: true, stdin: true });
            
            await new Promise((resolve, reject) => {
                let stderrData = '';
                docker.modem.demuxStream(compileStream, process.stdout, { write: (chunk) => { stderrData += chunk.toString() } });
                compileStream.write(code);
                compileStream.end();
                
                compileStream.on('end', async () => {
                    const result = await compileExec.inspect();
                    if (result.ExitCode !== 0) {
                        reject(new Error(`Compilation Error:\n${stderrData}`));
                    } else {
                        resolve();
                    }
                });
                compileStream.on('error', reject);
            });
        } else {
            // --- Write Phase for Python ---
            const writeExec = await container.exec({
                Cmd: ['sh', '-c', 'cat > script.py'],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true
            });
            const writeStream = await writeExec.start({ hijack: true, stdin: true });
            await new Promise((resolve, reject) => {
                writeStream.write(code);
                writeStream.end();
                writeStream.on('end', resolve);
                writeStream.on('error', reject);
            });
        }

        const results = [];
        
        // --- Run Phase against all Test Cases ---
        for (const tc of testcases) {
            const runCmd = isCpp ? ['./main'] : ['python3', 'script.py'];
            const runExec = await container.exec({
                Cmd: runCmd,
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true
            });
            
            const runStream = await runExec.start({ hijack: true, stdin: true });
            
            let stdoutData = '';
            let stderrData = '';
            
            docker.modem.demuxStream(runStream, 
                { write: (chunk) => { stdoutData += chunk.toString(); } },
                { write: (chunk) => { stderrData += chunk.toString(); } }
            );

            // Feed testcase input
            if (tc.input) {
                runStream.write(tc.input);
            }
            runStream.end();

            let timeoutHandle;
            
            const execPromise = new Promise((resolve) => {
                runStream.on('end', async () => {
                    clearTimeout(timeoutHandle);
                    const result = await runExec.inspect();
                    resolve({ exitCode: result.ExitCode, stdout: stdoutData, stderr: stderrData });
                });
            });

            const timeoutPromise = new Promise((resolve) => {
                timeoutHandle = setTimeout(() => {
                    resolve({ timeout: true });
                }, 2000); // Strict 2-second timeout per testcase
            });

            const execResult = await Promise.race([execPromise, timeoutPromise]);

            if (execResult.timeout) {
                results.push({ testcase_id: tc.id, status: 'TLE', output: null });
                break; // Stop execution on Time Limit Exceeded
            } else if (execResult.exitCode !== 0) {
                results.push({ testcase_id: tc.id, status: 'RE', output: execResult.stderr, exitCode: execResult.exitCode });
                break; // Stop execution on Runtime Error
            } else {
                const isCorrect = execResult.stdout.trim() === tc.expected_output.trim();
                const status = isCorrect ? 'AC' : 'WA';
                results.push({
                    testcase_id: tc.id,
                    status: status,
                    output: execResult.stdout
                });
                
                if (!isCorrect) {
                    break; // Stop execution on Wrong Answer to give immediate feedback and save resources
                }
            }
        }
        
        return { status: 'SUCCESS', results };

    } catch (err) {
        console.error('Container execution error:', err.message);
        return { status: 'CE', error: err.message };
    } finally {
        // Guarantee cleanup to prevent resource leaks (DooD best practice)
        try {
            await container.remove({ force: true });
        } catch (cleanupErr) {
            console.error('Failed to cleanup container:', cleanupErr);
        }
    }
}
