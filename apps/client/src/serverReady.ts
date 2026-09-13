export const HEALTH_RETRY_MS = 2500;
export const HEALTH_WAKING_MS = 8000;
export const HEALTH_MANUAL_MS = 30000;

export function healthUrl(origin: string) {
  return `${origin.replace(/\/$/, '')}/health`;
}

export async function probeServerHealth(origin: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchFn(healthUrl(origin));
    if (response.status !== 200) return false;
    const body: unknown = await response.json();
    return !!body && typeof body === 'object' && !Array.isArray(body) && (body as { status?: unknown }).status === 'ok';
  } catch {
    return false;
  }
}
