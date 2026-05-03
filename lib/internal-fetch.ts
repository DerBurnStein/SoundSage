import { headers } from 'next/headers';

// Server-component fetch helper. Calls our own API routes from inside the
// Next.js server, forwarding the request's cookie header so auth.js sees
// the same session.
//
// Why fetch instead of direct DB queries? The API routes already encode the
// caching logic (Redis), Zod-shaped responses, and timezone handling. Going
// through HTTP keeps that contract layer single-sourced.

const BASE = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export interface InternalFetchResult<T> {
  ok: boolean;
  data: T | null;
  status: number;
}

/**
 * Server-side GET to one of our internal API routes.
 *
 * Returns `ok: false, data: null` for 401 (unauthenticated) so callers can
 * branch into an empty-state render. Throws on 5xx / network errors.
 */
export async function internalGet<T>(path: string): Promise<InternalFetchResult<T>> {
  const cookie = headers().get('cookie') ?? '';
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    return { ok: false, data: null, status: res.status };
  }
  if (!res.ok) {
    throw new Error(`internalGet ${path}: ${res.status}`);
  }
  const data = (await res.json()) as T;
  return { ok: true, data, status: res.status };
}
