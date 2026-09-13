export function listenBind(env: NodeJS.Dict<string> = process.env): { port: number; host: string } {
  const parsed = Number(env.PORT ?? 2567);
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : 2567;
  const host = env.HOST?.trim() || '0.0.0.0';
  return { port, host };
}
