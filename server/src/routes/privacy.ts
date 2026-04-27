import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { pool, deleteUserData } from '../utils/db';

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.authUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return next();
}

router.get('/export', requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.authUser!.id;

  const [user, events, state] = await Promise.all([
    pool.query('SELECT id, spotify_user_id, display_name, email, country, product_tier, created_at FROM users WHERE id = $1', [userId]),
    pool.query('SELECT played_at, spotify_track_id, track_name, artist_names, album_name, duration_ms FROM play_events WHERE user_id = $1 ORDER BY played_at DESC', [userId]),
    pool.query('SELECT last_played_at, last_run_at, total_events_ingested FROM ingestion_state WHERE user_id = $1', [userId])
  ]);

  return res.json({
    exportedAt: new Date().toISOString(),
    user: user.rows[0] ?? null,
    ingestionState: state.rows[0] ?? null,
    playEvents: events.rows
  });
});

router.delete('/delete', requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.authUser!.id;
  await deleteUserData(userId);

  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({ deleted: true });
  });
});

export default router;
