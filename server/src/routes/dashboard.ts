import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDashboardSummary, getRecentEvents } from '../services/insights';

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.authUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return next();
}

router.get('/summary', requireAuth, async (req: Request, res: Response) => {
  const rawDays = Number.parseInt(String(req.query.days ?? '30'), 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 7), 365) : 30;
  const summary = await getDashboardSummary(req.session.authUser!.id, days);
  return res.json(summary);
});

router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  const rawLimit = Number.parseInt(String(req.query.limit ?? '25'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 25;
  const events = await getRecentEvents(req.session.authUser!.id, limit);
  return res.json({ events });
});

export default router;
