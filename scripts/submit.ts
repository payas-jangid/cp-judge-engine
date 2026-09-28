import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { prisma } from '../src/shared/db';

const API_URL = 'http://localhost:3000/api';

const extToLang: Record<string, string> = {
    '.cpp': 'cpp',
    '.c': 'c',
    '.py': 'python',
    '.java': 'java',
    '.js': 'javascript',
    '.ts': 'typescript',
};

async function getContext() {
    let user = await prisma.user.findFirst();
    if (!user) {
        user = await prisma.user.create({
            data: {
                username: 'tester',
                email: 'tester@example.com',
                passwordHash: 'dummy_hash'
            }
        });
    }

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
                        }
                    ]
                }
            },
            include: { testCases: true }
        });
    } else if (problem.testCases.length === 0) {
        await prisma.testCase.create({
            data: {
                problemId: problem.id,
                input: '3 5\n',
                expectedOutput: '8\n',
                isHidden: false
            }
        });
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

async function main() {
    const filePath = process.argv[2];
    
    if (!filePath) {
        console.error('Usage: npm run submit <path-to-file>');
        console.error('Example: npm run submit solution.cpp');
        process.exit(1);
    }

    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`Error: File not found at ${absolutePath}`);
        process.exit(1);
    }

    const sourceCode = fs.readFileSync(absolutePath, 'utf8');
    const ext = path.extname(absolutePath).toLowerCase();
    const language = extToLang[ext] || 'cpp'; // Default to cpp if unknown

    console.log(`Preparing to submit ${path.basename(absolutePath)} (Language: ${language})...`);

    try {
        const { userId, problemId } = await getContext();
        
        console.log(`Submitting to Problem ID ${problemId} as User ID ${userId}...`);
        
        const res = await axios.post(`${API_URL}/submissions`, {
            problemId,
            userId,
            language,
            sourceCode
        });

        const submissionId = res.data.id;
        console.log(`Submission successful! ID: ${submissionId}`);
        console.log(`Waiting for judge to process...`);

        const finalResult = await pollSubmission(submissionId);
        
        console.log('\n==================================================');
        console.log('                 Judge Result                     ');
        console.log('==================================================');
        console.log(`Status:  ${finalResult.status}`);
        console.log(`Verdict: ${finalResult.verdict}`);
        if (finalResult.timeMs !== null) console.log(`Time:    ${finalResult.timeMs}ms`);
        if (finalResult.memoryKb !== null) console.log(`Memory:  ${finalResult.memoryKb}KB`);
        if (finalResult.error) {
            console.log(`\nError details:\n${finalResult.error}`);
        }
        console.log('==================================================\n');

    } catch (err: any) {
        if (err.response) {
             console.error(`API Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
        } else {
             console.error(`Error: ${err.message}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
