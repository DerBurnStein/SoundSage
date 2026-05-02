import cron from 'node-cron';
import { prisma } from './prisma.js';
import { enqueueIngestion } from './queue.js';

export async function startScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    const users = await prisma.spotifyAccount.findMany({ where: { connected: true }, select: { userId: true } });
    for (const u of users) {
      await enqueueIngestion(u.userId, 'scheduled');
    }
  });

  console.log('Ingestion scheduler started (every 15 minutes).');
}

if (process.argv[1]?.includes('scheduler.js')) {
  startScheduler();
}
