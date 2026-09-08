import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

const execAsync = util.promisify(exec);

export async function judgeCpp(
    containerId: string,
    sourceCode: string,
    testCases: { input: string; expectedOutput: string }[],
    timeLimitMs: number
): Promise<{ verdict: string; errorOutput?: string; timeMs?: number }> {
    
    // Create a temporary directory on the host to share files via docker cp
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-judge-'));
    const sourcePath = path.join(tmpDir, 'main.cpp');
    const execName = 'a.out';
    
    try {
        await fs.writeFile(sourcePath, sourceCode);

        // Copy source code to container
        await execAsync(`docker cp ${sourcePath} ${containerId}:/tmp/main.cpp`);

        // Compile inside container
        try {
            await execAsync(`docker exec ${containerId} g++ -O2 -w -std=c++17 /tmp/main.cpp -o /tmp/${execName}`);
        } catch (compileErr: any) {
            const errStr = compileErr.stderr || compileErr.message;
            return { verdict: 'CE', errorOutput: errStr };
        }

        let maxTimeMs = 0;

        for (const tc of testCases) {
            const inputPath = path.join(tmpDir, 'input.txt');
            await fs.writeFile(inputPath, tc.input);
            await execAsync(`docker cp "${inputPath}" ${containerId}:/tmp/input.txt`);

            const timeLimitS = Math.ceil(timeLimitMs / 1000) + 1;
            const startTime = Date.now();
            let output = '';
            try {
                const { stdout } = await execAsync(`docker exec ${containerId} bash -c "timeout ${timeLimitS}s /tmp/${execName} < /tmp/input.txt"`);
                output = stdout;
            } catch (runErr: any) {
                const code = runErr.code;
                if (code === 124) return { verdict: 'TLE' };
                if (code === 137) return { verdict: 'MLE' };
                return { verdict: 'RE', errorOutput: runErr.stderr || 'Runtime error' };
            }
            const endTime = Date.now();
            const timeTaken = endTime - startTime;
            maxTimeMs = Math.max(maxTimeMs, timeTaken);

            if (timeTaken > timeLimitMs) {
                return { verdict: 'TLE' };
            }

            // Compare output
            const expected = tc.expectedOutput.trim().replace(/\r\n/g, '\n');
            const actual = output.trim().replace(/\r\n/g, '\n');

            if (expected !== actual) {
                return { verdict: 'WA' };
            }
        }

        return { verdict: 'AC', timeMs: maxTimeMs };

    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
    }
}
