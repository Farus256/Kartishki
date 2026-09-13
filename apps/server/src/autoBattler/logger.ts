const enabled = process.env.DEBUG_AB === '1';

export function abLog(event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  console.log(`[ab] ${event}`, data ?? '');
}
