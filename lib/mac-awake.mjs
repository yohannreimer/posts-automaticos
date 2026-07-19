import { spawn } from 'node:child_process';

export function createAwakeGuard({
  platform = process.platform,
  spawnProcess = spawn,
  logger = console,
} = {}) {
  return async function withAwake(task) {
    if (platform !== 'darwin') return task();

    const inhibitor = spawnProcess('caffeinate', ['-i'], { stdio: 'ignore' });
    inhibitor.on?.('error', (error) => {
      logger.warn?.(`[energia] não foi possível iniciar caffeinate: ${error.message}`);
    });

    try {
      return await task();
    } finally {
      inhibitor.kill?.('SIGTERM');
    }
  };
}
