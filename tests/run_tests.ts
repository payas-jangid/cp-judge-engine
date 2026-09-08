import axios from 'axios';
import { prisma } from '../src/shared/db';

const API_URL = 'http://localhost:3000/api';

async function seedDatabaseIfNecessary() {
    console.log('Checking database seed data...');
    
    // 1. Ensure test user exists
    let user = await prisma.user.findFirst();
    if (!user) {
        user = await prisma.user.create({
            data: {
                username: 'tester',
                email: 'tester@example.com',
                passwordHash: 'dummy_hash'
            }
        });
        console.log(`Created test user with ID: ${user.id}`);
    }

    // 2. Ensure test problem exists
    let problem = await prisma.problem.findFirst({
        where: { id: 1 },
        include: { testCases: true }
    });

    if (!problem) {
        problem = await prisma.problem.create({
            data: {
                id: 1,
                title: 'A + B Problem',
                statement: 'Given two integers a and b, output their sum.',
                timeLimitMs: 1000,
                memoryLimitKb: 262144, // 256MB
                authorId: user.id,
                testCases: {
                    create: [
                        {
                            input: '3 5\n',
                            expectedOutput: '8\n',
                            isHidden: false
                        },
                        {
                            input: '100 250\n',
                            expectedOutput: '350\n',
                            isHidden: true
                        }
                    ]
                }
            },
            include: { testCases: true }
        });
        console.log(`Created test problem with ID: ${problem.id} and ${problem.testCases.length} testcases`);
    } else if (problem.testCases.length === 0) {
        await prisma.testCase.create({
            data: {
                problemId: problem.id,
                input: '3 5\n',
                expectedOutput: '8\n',
                isHidden: false
            }
        });
        console.log(`Added testcases to problem ID: ${problem.id}`);
    }

    return { userId: user.id, problemId: problem.id };
}

async function pollSubmission(submissionId: number, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await axios.get(`${API_URL}/submissions/${submissionId}`);
        if (res.data.status === 'COMPLETED' || res.data.status === 'SYSTEM_ERROR') {
            return res.data;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const res = await axios.get(`${API_URL}/submissions/${submissionId}`);
    return res.data;
}

async function runTests() {
    console.log('==================================================');
    console.log('       CP Judge Engine End-to-End Test Suite      ');
    console.log('==================================================\n');

    try {
        const { userId, problemId } = await seedDatabaseIfNecessary();

        const testCases = [
            {
                name: '1. Accepted (AC)',
                expectedVerdict: 'AC',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) cout << a + b << endl;
    return 0;
}
                `
            },
            {
                name: '2. Wrong Answer (WA)',
                expectedVerdict: 'WA',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) cout << a + b + 1 << endl; // Wrong logic
    return 0;
}
                `
            },
            {
                name: '3. Time Limit Exceeded (TLE)',
                expectedVerdict: 'TLE',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    while(true) {} // Infinite loop
    return 0;
}
                `
            },
            {
                name: '4. Compile Error (CE)',
                expectedVerdict: 'CE',
                language: 'cpp',
                sourceCode: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b // Missing semicolon
    return 0;
}
                `
            },
            {
                name: '5. Memory Limit Exceeded (MLE)',
                expectedVerdict: 'MLE',
                language: 'cpp',
                sourceCode: `
#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int*> ptrs;
    while(true) {
        ptrs.push_back(new int[1000000]);
    }
    return 0;
}
                `
            },
            {
                name: '6. Security Resilience: Fork Bomb',
                expectedVerdict: 'RE',
                language: 'cpp',
                sourceCode: `
#include <unistd.h>
int main() {
    while(1) {
        fork();
    }
    return 0;
}
                `
            }
        ];

        console.log(`Submitting ${testCases.length} test programs...\n`);
        const results = [];

        for (const tc of testCases) {
            process.stdout.write(`Submitting ${tc.name}... `);
            try {
                const res = await axios.post(`${API_URL}/submissions`, {
                    problemId,
                    userId,
                    language: tc.language,
                    sourceCode: tc.sourceCode
                });

                const submissionId = res.data.id;
                process.stdout.write(`[ID: ${submissionId}, QUEUED] Waiting for judge... `);

                const finalResult = await pollSubmission(submissionId);
                const passed = finalResult.verdict === tc.expectedVerdict || 
                    (tc.name.includes('Fork Bomb') && ['RE', 'MLE', 'TLE'].includes(finalResult.verdict));

                console.log(`-> Verdict: ${finalResult.verdict} (Expected: ${tc.expectedVerdict}) ${passed ? '✅ PASS' : '❌ FAIL'}`);
                results.push({
                    name: tc.name,
                    expected: tc.expectedVerdict,
                    actual: finalResult.verdict,
                    timeMs: finalResult.timeMs || '-',
                    status: finalResult.status,
                    passed
                });
            } catch (err: any) {
                console.log(`FAILED to submit: ${err.message}`);
                results.push({
                    name: tc.name,
                    expected: tc.expectedVerdict,
                    actual: 'ERROR',
                    timeMs: '-',
                    status: 'ERROR',
                    passed: false
                });
            }
        }

        console.log('\n==================================================');
        console.log('                  Test Summary                    ');
        console.log('==================================================');
        console.table(results.map(r => ({
            Case: r.name,
            Expected: r.expected,
            Verdict: r.actual,
            Time: r.timeMs,
            Result: r.passed ? 'PASS' : 'FAIL'
        })));

    } catch (err: any) {
        console.error('Test suite execution failed:', err.message || err);
    } finally {
        await prisma.$disconnect();
    }
}

runTests();
