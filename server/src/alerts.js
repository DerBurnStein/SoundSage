import { logEvent } from './monitoring.js';

export async function sendAlert(type, payload) {
  logEvent('warn', 'alert_triggered', { type, payload });
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, ts: new Date().toISOString() }),
    });
  } catch (err) {
    logEvent('error', 'alert_delivery_failed', { type, error: String(err) });
  }
}
