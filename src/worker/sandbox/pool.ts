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
        await this.fillPool();
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
        // Base image: ubuntu with g++ (we'll just use gcc:latest for now)
        // Memory limit using cgroups native --memory. 
        // We set generous limit here and use timeout command for CPU, or we can use generic limits.
        // The prompt says "native cgroup tracking", so --memory=256m
        // Process limit --pids-limit 64 to prevent fork bombs.
        const cmd = `docker run -d --network none --memory=256m --pids-limit=64 --cap-drop=ALL gcc:latest sleep infinity`;
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

export const sandboxPool = new StandbyPoolManager(3);
