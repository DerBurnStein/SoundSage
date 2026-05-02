import crypto from 'crypto';

export function requestContext(req, res, next) {
  const incoming = req.header('x-correlation-id');
  const correlationId = incoming || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const started = Date.now();
  console.log(JSON.stringify({ level: 'info', event: 'request_start', correlationId, method: req.method, path: req.path }));

  res.on('finish', () => {
    console.log(JSON.stringify({ level: 'info', event: 'request_end', correlationId, method: req.method, path: req.path, status: res.statusCode, latencyMs: Date.now() - started }));
  });

  next();
}
