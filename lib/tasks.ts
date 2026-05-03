import logger from './logger';

export interface SyncTaskPayload {
  userId: string;
}

/**
 * Enqueues a sync task for the given user.
 *
 * In development (or when CLOUD_TASKS_QUEUE is absent): runs incrementalSync
 * fire-and-forget inline — no Cloud Tasks infrastructure needed.
 *
 * In production: creates an HTTP task on the Cloud Tasks queue, which Cloud
 * Run will invoke via OIDC-authenticated POST /api/tasks/sync-user.
 */
export async function enqueueSyncTask(payload: SyncTaskPayload): Promise<string> {
  const isProd =
    process.env.NODE_ENV === 'production' && !!process.env.CLOUD_TASKS_QUEUE;

  if (!isProd) {
    // Dev shortcut — run sync in the background, don't block the response
    import('./sync')
      .then(({ incrementalSync }) => incrementalSync(payload.userId))
      .then((result) => logger.info({ ...result, userId: payload.userId }, 'Dev sync done'))
      .catch((err) =>
        logger.error({ userId: payload.userId, err: String(err) }, 'Dev sync failed')
      );

    const jobId = `dev-sync-${Date.now()}`;
    logger.info({ userId: payload.userId, jobId }, 'Dev sync enqueued');
    return jobId;
  }

  // Production: delegate to Cloud Tasks
  const { CloudTasksClient } = await import('@google-cloud/tasks');
  const client = new CloudTasksClient();

  const project = process.env.GCP_PROJECT_ID!;
  const location = process.env.GCP_REGION ?? 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE!;
  const appUrl = process.env.NEXTAUTH_URL!;
  const targetUrl = `${appUrl}/api/tasks/sync-user`;
  const serviceAccountEmail = process.env.CLOUD_TASKS_SA_EMAIL!;

  const parent = client.queuePath(project, location, queue);
  const [task] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: targetUrl,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: { serviceAccountEmail, audience: targetUrl },
      },
    },
  });

  const taskName = task.name ?? 'unknown';
  logger.info({ userId: payload.userId, taskName }, 'Cloud Task enqueued');
  return taskName;
}
