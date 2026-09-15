const LOCAL = 'http://127.0.0.1:2567';

export function isLoopback(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

/** Single public origin for REST, catalog, auth and Colyseus (http/https → ws/wss). */
export function resolveServerOrigin(
  raw: string | undefined,
  pageProtocol = typeof window === 'undefined' ? 'http:' : window.location.protocol,
  fallback = LOCAL,
): string {
  const value = (raw ?? '').trim() || fallback;
  let origin = value.replace(/\/$/, '').replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
  if (pageProtocol === 'https:' && origin.startsWith('http://') && !isLoopback(origin)) {
    origin = `https://${origin.slice('http://'.length)}`;
  }
  return origin;
}

export function serverOrigin(): string {
  return resolveServerOrigin(import.meta.env.VITE_SERVER_URL);
}

/** A loopback server is never "asleep": local play must open without waiting for /health. */
export function serverGateRequired(origin = serverOrigin()): boolean {
  return !isLoopback(origin);
}
