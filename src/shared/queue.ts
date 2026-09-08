import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
});

export const submissionQueue = new Queue('submissions', { connection });
export const queueEvents = new QueueEvents('submissions', { connection });
