import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ingestRecentListening } from '../services/ingestion';

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.authUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return next();
}

router.post('/recent', requireAuth, async (req: Request, res: Response) => {
  const result = await ingestRecentListening(req.session.authUser!.id);
  return res.json(result);
});

export default router;
