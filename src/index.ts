import { startWorker } from './worker';

const processType = process.env.PROCESS_TYPE || 'api';

if (processType === 'worker') {
    startWorker().catch(err => {
        console.error('Failed to start worker:', err);
        process.exit(1);
    });
} else {
    // API is started in api/index.ts, so we can just require it
    require('./api');
}
