import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class StandbyPoolManager {
    private readyContainers: string[] = [];
    private poolSize: number;
    private isFilling: boolean = false;

    constructor(poolSize: number = 3) {
        this.poolSize = poolSize;
    }

    public async initialize() {
        console.log(`Initializing Standby Pool Manager with size ${this.poolSize}...`);
        await this.cleanupOrphans();
        this.registerShutdownHooks();
        await this.fillPool();
    }

    // Clean up any stale sandbox containers left over from previous runs
    public async cleanupOrphans() {
        try {
            const { stdout } = await execAsync('docker ps -aq --filter label=cp-judge-sandbox=true');
            const ids = stdout.trim().split(/\s+/).filter(Boolean);
            if (ids.length > 0) {
                console.log(`Cleaning up ${ids.length} orphaned sandbox container(s)...`);
                await execAsync(`docker rm -f ${ids.join(' ')}`);
            }
        } catch (err) {
            // Ignore if none found or error
        }
    }

    // Clean up all currently active standby containers
    public async cleanupAll() {
        console.log('Shutting down standby sandbox containers...');
        const containers = [...this.readyContainers];
        this.readyContainers = [];
        await Promise.all(containers.map(id => this.destroyContainer(id)));
    }

    private registerShutdownHooks() {
        const handleExit = async () => {
            await this.cleanupAll();
            process.exit(0);
        };

        process.once('SIGINT', handleExit);
        process.once('SIGTERM', handleExit);
    }

    private async fillPool() {
        if (this.isFilling) return;
        this.isFilling = true;

        try {
            while (this.readyContainers.length < this.poolSize) {
                const containerId = await this.createNewContainer();
                this.readyContainers.push(containerId);
                console.log(`Created standby container: ${containerId}`);
            }
        } catch (err) {
            console.error('Error filling container pool:', err);
        } finally {
            this.isFilling = false;
        }
    }

    private async createNewContainer(): Promise<string> {
        const cmd = `docker run -d --label cp-judge-sandbox=true --network none --memory=256m --pids-limit=64 --cap-drop=ALL gcc:latest sleep infinity`;
        const { stdout } = await execAsync(cmd);
        return stdout.trim();
    }

    public async getContainer(): Promise<string> {
        // Wait if pool is empty
        while (this.readyContainers.length === 0) {
            await new Promise(r => setTimeout(r, 100));
        }
        const containerId = this.readyContainers.shift()!;
        
        // Asynchronously replenish
        this.fillPool().catch(console.error);

        return containerId;
    }

    public async destroyContainer(containerId: string) {
        try {
            await execAsync(`docker rm -f ${containerId}`);
            console.log(`Destroyed container: ${containerId}`);
        } catch (err) {
            console.error(`Failed to destroy container ${containerId}:`, err);
        }
    }
}

const defaultPoolSize = parseInt(process.env.SANDBOX_POOL_SIZE || '2', 10);
export const sandboxPool = new StandbyPoolManager(defaultPoolSize);
