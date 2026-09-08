import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../shared/db';
import { sandboxPool } from './sandbox/pool';
import { judgeCpp } from './judges/cpp';
import dotenv from 'dotenv';
dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const pubClient = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

async function broadcastStatus(submissionId: number, status: string, verdict?: string) {
    const payload = JSON.stringify({ submissionId, status, verdict });
    await pubClient.publish('submission-updates', payload);
}

export async function startWorker() {
    console.log('Starting CP Judge Worker...');
    await sandboxPool.initialize();

    const worker = new Worker('submissions', async (job) => {
        const { submissionId } = job.data;
        console.log(`Processing submission ${submissionId}`);

        try {
            await prisma.submission.update({
                where: { id: submissionId },
                data: { status: 'RUNNING' }
            });
            await broadcastStatus(submissionId, 'RUNNING');

            const submission = await prisma.submission.findUnique({
                where: { id: submissionId },
                include: { problem: { include: { testCases: true } } }
            });

            if (!submission) throw new Error('Submission not found');

            const containerId = await sandboxPool.getContainer();
            let result: any;

            try {
                if (submission.language === 'cpp') {
                    result = await judgeCpp(
                        containerId,
                        submission.sourceCode,
                        submission.problem.testCases,
                        submission.problem.timeLimitMs
                    );
                } else {
                    throw new Error('Unsupported language');
                }
            } finally {
                // Always destroy the container after use
                await sandboxPool.destroyContainer(containerId);
            }

            // Update database with final verdict
            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status: 'COMPLETED',
                    verdict: result.verdict as any,
                    timeMs: result.timeMs,
                    errorOutput: result.errorOutput,
                }
            });

            await broadcastStatus(submissionId, 'COMPLETED', result.verdict);
            console.log(`Finished submission ${submissionId}: ${result.verdict}`);
        } catch (err) {
            console.error(`Error processing submission ${submissionId}:`, err);
            await prisma.submission.update({
                where: { id: submissionId },
                data: { status: 'SYSTEM_ERROR' }
            });
            await broadcastStatus(submissionId, 'SYSTEM_ERROR');
            throw err; // Trigger retry via BullMQ
        }
    }, { connection });

    worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed:`, err);
    });
}
