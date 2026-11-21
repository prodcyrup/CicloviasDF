// EixoVerde — Supabase Edge Function: OpenRouteService (ORS) Proxy
// Keeps `ORS_API_KEY` strictly server-side with strict payload validation,
// CORS headers, sliding-window rate limiting, and upstream timeout handling.
// Works seamlessly with both modern `sb_publishable_...` keys (apikey-only)
// and authenticated user JWTs (`verify_jwt = false`).

const ALLOWED_PROFILES = new Set([
  'cycling-regular',
  'cycling-electric',
  'cycling-road',
]);

const ALLOWED_PREFERENCES = new Set([
  'recommended',
  'shortest',
  'fastest',
]);

const ALLOWED_EXTRA_INFO = new Set([
  'waytype',
  'surface',
  'steepness',
  'suitability',
]);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_WINDOW_MS = 60_000;
const IP_LIMIT_PER_WINDOW = 60;
const USER_LIMIT_PER_WINDOW = 60;
const MAX_RATE_BUCKETS = 1_000;
const UPSTREAM_TIMEOUT_MS = 8_500;
const MAX_COORDINATES = 25;

// Separate sliding-window maps so forged JWT `sub` floods can never evict real IP buckets.
const ipRateBuckets = new Map<string, number[]>();
const userRateBuckets = new Map<string, number[]>();

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function decodeJwtSubject(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return null;

  const token = match[1];
  const segments = token.split('.');
  if (segments.length !== 3) {
    // Safely ignores non-JWT keys such as `sb_publishable_...`
    return null;
  }

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { sub?: unknown };
    if (typeof payload.sub === 'string' && payload.sub.trim().length > 0) {
      return payload.sub.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function resolveCallerIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const xff = req.headers.get('x-forwarded-for');
  const firstForwardedIp = xff?.split(',')[0]?.trim();
  const apiKey = req.headers.get('apikey')?.trim();
  const maskedApiKey = apiKey ? `key:${apiKey.slice(0, 12)}` : '';

  const caller = cfIp || realIp || firstForwardedIp || maskedApiKey || 'anonymous';
  return `ip:${caller}`;
}

function pruneBuckets(
  buckets: Map<string, number[]>,
  targetKey: string,
  cutoff: number,
): void {
  if (buckets.size < MAX_RATE_BUCKETS) {
    return;
  }

  for (const [bucketKey, timestamps] of buckets.entries()) {
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      buckets.delete(bucketKey);
    } else {
      buckets.set(bucketKey, fresh);
    }
  }

  // Hard cap fallback: evict oldest inserted entry if still at capacity
  if (buckets.size >= MAX_RATE_BUCKETS && !buckets.has(targetKey)) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
    }
  }
}

function inspectBucket(
  buckets: Map<string, number[]>,
  key: string,
  limit: number,
  nowMs: number,
): { allowed: boolean; retryAfterSec: number; recent: number[] } {
  const cutoff = nowMs - RATE_WINDOW_MS;
  pruneBuckets(buckets, key, cutoff);

  const existing = buckets.get(key) ?? [];
  const recent = existing.filter((t) => t > cutoff);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - nowMs) / 1000));
    return { allowed: false, retryAfterSec, recent };
  }

  return { allowed: true, retryAfterSec: 0, recent };
}

function checkCallerRateLimit(
  req: Request,
  nowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const ipKey = resolveCallerIp(req);
  const ipCheck = inspectBucket(ipRateBuckets, ipKey, IP_LIMIT_PER_WINDOW, nowMs);
  if (!ipCheck.allowed) {
    return { allowed: false, retryAfterSec: ipCheck.retryAfterSec };
  }

  const sub = decodeJwtSubject(req.headers.get('authorization'));
  if (sub) {
    const userKey = `user:${sub}`;
    const userCheck = inspectBucket(userRateBuckets, userKey, USER_LIMIT_PER_WINDOW, nowMs);
    if (!userCheck.allowed) {
      return { allowed: false, retryAfterSec: userCheck.retryAfterSec };
    }

    ipCheck.recent.push(nowMs);
    ipRateBuckets.set(ipKey, ipCheck.recent);
    userCheck.recent.push(nowMs);
    userRateBuckets.set(userKey, userCheck.recent);
    return { allowed: true, retryAfterSec: 0 };
  }

  ipCheck.recent.push(nowMs);
  ipRateBuckets.set(ipKey, ipCheck.recent);
  return { allowed: true, retryAfterSec: 0 };
}

interface ValidatedOrsPayload {
  profile: string;
  coordinates: [number, number][];
  preference: string;
  elevation: boolean;
  extra_info: string[];
  instructions: boolean;
}

function validateRequestPayload(raw: unknown): { data?: ValidatedOrsPayload; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Request body must be a JSON object' };
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.profile !== 'string' || !ALLOWED_PROFILES.has(body.profile)) {
    return { error: 'Invalid profile. Allowed: cycling-regular, cycling-electric, cycling-road' };
  }

  if (
    !Array.isArray(body.coordinates) ||
    body.coordinates.length < 2 ||
    body.coordinates.length > MAX_COORDINATES
  ) {
    return { error: `coordinates must contain between 2 and ${MAX_COORDINATES} [lng, lat] pairs` };
  }

  const coordinates: [number, number][] = [];
  for (const pair of body.coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) {
      return { error: 'Each coordinate must be a [lng, lat] numeric pair' };
    }
    const lng = pair[0];
    const lat = pair[1];
    if (
      typeof lng !== 'number' ||
      typeof lat !== 'number' ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      return { error: 'Coordinates contain out-of-range or non-finite values' };
    }
    coordinates.push([lng, lat]);
  }

  let preference = 'recommended';
  if (body.preference !== undefined) {
    if (typeof body.preference !== 'string' || !ALLOWED_PREFERENCES.has(body.preference)) {
      return { error: 'Invalid preference. Allowed: recommended, shortest, fastest' };
    }
    preference = body.preference;
  }

  let elevation = true;
  if (body.elevation !== undefined) {
    if (typeof body.elevation !== 'boolean') {
      return { error: 'elevation must be a boolean' };
    }
    elevation = body.elevation;
  }

  let extra_info = ['waytype', 'surface'];
  if (body.extra_info !== undefined) {
    if (!Array.isArray(body.extra_info)) {
      return { error: 'extra_info must be an array of strings' };
    }
    const filtered = body.extra_info.filter(
      (item): item is string => typeof item === 'string' && ALLOWED_EXTRA_INFO.has(item),
    );
    extra_info = filtered.length > 0 ? Array.from(new Set(filtered)) : ['waytype', 'surface'];
  }

  let instructions = false;
  if (body.instructions !== undefined) {
    if (typeof body.instructions !== 'boolean') {
      return { error: 'instructions must be a boolean' };
    }
    instructions = body.instructions;
  }

  return {
    data: {
      profile: body.profile,
      coordinates,
      preference,
      elevation,
      extra_info,
      instructions,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const orsApiKey = Deno.env.get('ORS_API_KEY')?.trim();
  if (!orsApiKey) {
    return jsonResponse({ error: 'ORS_API_KEY not configured' }, 503);
  }

  const rate = checkCallerRateLimit(req, Date.now());
  if (!rate.allowed) {
    return jsonResponse(
      { error: 'Rate limit exceeded' },
      429,
      { 'Retry-After': String(rate.retryAfterSec) },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const validated = validateRequestPayload(rawBody);
  if (!validated.data) {
    return jsonResponse({ error: validated.error ?? 'Invalid request payload' }, 400);
  }

  const { profile, coordinates, preference, elevation, extra_info, instructions } = validated.data;
  const upstreamUrl = `https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: orsApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify({
        coordinates,
        elevation,
        preference,
        extra_info,
        instructions,
      }),
      signal: controller.signal,
    });

    if (upstreamRes.status === 429) {
      const retryAfter = upstreamRes.headers.get('retry-after') ?? '60';
      return jsonResponse(
        { error: 'Upstream routing rate limit exceeded' },
        429,
        { 'Retry-After': retryAfter },
      );
    }

    if (!upstreamRes.ok) {
      return jsonResponse(
        {
          error: 'Upstream routing service failed',
          upstreamStatus: upstreamRes.status,
        },
        502,
      );
    }

    const geojsonBody = await upstreamRes.text();
    const contentType =
      upstreamRes.headers.get('content-type') || 'application/geo+json; charset=utf-8';

    return new Response(geojsonBody, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    if ((err instanceof DOMException || err instanceof Error) && err.name === 'AbortError') {
      return jsonResponse({ error: 'Upstream routing request timed out' }, 504);
    }
    return jsonResponse({ error: 'Unable to reach upstream routing service' }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
});
