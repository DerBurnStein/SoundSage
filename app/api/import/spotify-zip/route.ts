import { type NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/lib/session';
import { runImport } from '@/lib/import-runner';
import logger from '@/lib/logger';

// Cap upload size at 100MB. Spotify Extended Streaming History exports for
// even very heavy listeners are typically <50MB, so this is generous.
const MAX_BYTES = 100 * 1024 * 1024;

// Cloud Run default request body limit is 32MB. Production deploys should
// either raise this with --request-timeout or switch to the GCS signed-URL
// flow (Phase 7 deploy work).
export const maxDuration = 600; // seconds — Cloud Run job-style processing
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Accepts a Spotify Extended Streaming History ZIP and starts an import in
 * the background. Returns a jobId immediately; client polls /status?jobId=
 * for progress.
 *
 * Local dev path: ZIP is sent inline as multipart/form-data.
 * Production path (Phase 7): client uploads to a GCS signed URL, then calls
 * a separate /finalize endpoint that enqueues a Cloud Tasks worker.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid multipart body: ${String(err)}` },
      { status: 400 }
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Expected a file under form field 'file'" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes; limit ${MAX_BYTES})` },
      { status: 413 }
    );
  }

  // Pull the whole ZIP into a Buffer. unzipper.Open.buffer needs random
  // access; we can't stream this part. Streaming is preserved INSIDE each
  // JSON file, which is where the memory pressure actually lives.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const jobId = randomUUID();
  logger.info({ jobId, userId, sizeBytes: buffer.byteLength }, 'Import: ZIP received');

  // Fire-and-forget. The runner writes progress to Redis; the client polls.
  runImport(jobId, userId, buffer).catch((err) => {
    logger.error({ jobId, userId, err: String(err) }, 'Import: runner crashed');
  });

  return NextResponse.json({ jobId, status: 'running' });
}
