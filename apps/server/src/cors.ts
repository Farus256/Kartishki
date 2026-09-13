const DEV_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
];

/** Comma-separated public origins from CORS_ORIGIN, plus local Vite ports. */
export function allowedOrigins(fromEnv = process.env.CORS_ORIGIN): string[] {
  const extra = (fromEnv ?? '').split(',').map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean);
  return [...new Set([...DEV_ORIGINS, ...extra])];
}

export function corsAllowOrigin(requestOrigin: string | undefined, allowed = allowedOrigins()): string | undefined {
  if (!requestOrigin) return undefined;
  const origin = requestOrigin.replace(/\/$/, '');
  return allowed.includes(origin) ? origin : undefined;
}

/** Colyseus merges this over DEFAULT_CORS_HEADERS, which otherwise reflects any Origin (and `*`). */
export function colyseusOriginHeaders(requestOrigin: string | undefined, allowed = allowedOrigins()): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = corsAllowOrigin(requestOrigin, allowed);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function tightenColyseusCors(controller: {
  DEFAULT_CORS_HEADERS: Record<string, string>;
  getCorsHeaders: (headers: Headers) => Record<string, string>;
}) {
  delete controller.DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin'];
  controller.getCorsHeaders = headers => colyseusOriginHeaders(headers.get('origin') ?? undefined);
}
