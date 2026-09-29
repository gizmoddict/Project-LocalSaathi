import { WorkerBootstrap } from '../src/worker.bootstrap';

describe('WorkerBootstrap', () => {
  it('should initialize and shut down cleanly', async () => {
    const worker = new WorkerBootstrap();
    expect(worker.getStatus().isRunning).toBe(false);

    await worker.start();
    expect(worker.getStatus().isRunning).toBe(true);

    await worker.stop();
    expect(worker.getStatus().isRunning).toBe(false);
  });
});
