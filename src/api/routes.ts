import { Router, Request, Response } from 'express';
import { prisma } from '../shared/db';
import { submissionQueue } from '../shared/queue';

const router = Router();

// Endpoint to submit code
router.post('/submissions', async (req: Request, res: Response): Promise<any> => {
  try {
    const { problemId, userId, language, sourceCode } = req.body;

    if (!problemId || !userId || !language || !sourceCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save submission to DB
    const submission = await prisma.submission.create({
      data: {
        problemId,
        userId,
        language,
        sourceCode,
        status: 'QUEUED',
      },
    });

    // Add to BullMQ
    await submissionQueue.add('judge-submission', {
      submissionId: submission.id,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });

    return res.status(201).json(submission);
  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({ error: 'Failed to process submission' });
  }
});

// Endpoint to get submission status
router.get('/submissions/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const submission = await prisma.submission.findUnique({
      where: { id },
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    return res.json(submission);
  } catch (error) {
    console.error('Fetch submission error:', error);
    return res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Create a problem
router.post('/problems', async (req: Request, res: Response): Promise<any> => {
    try {
      const { title, statement, timeLimitMs, memoryLimitKb, authorId } = req.body;
      const problem = await prisma.problem.create({
          data: {
              title,
              statement,
              timeLimitMs,
              memoryLimitKb,
              authorId
          }
      });
      return res.status(201).json(problem);
    } catch(err) {
        return res.status(500).json({error: 'Failed'});
    }
});

// Add a test case
router.post('/problems/:id/testcases', async (req: Request, res: Response): Promise<any> => {
    try {
        const problemId = parseInt(req.params.id as string, 10);
        const { input, expectedOutput, isHidden } = req.body;
        const testCase = await prisma.testCase.create({
            data: {
                problemId,
                input,
                expectedOutput,
                isHidden
            }
        });
        return res.status(201).json(testCase);
    } catch(err) {
        return res.status(500).json({error: 'Failed'});
    }
});

export { router };
export default router;
