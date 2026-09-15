import { useEffect, useState } from 'react';
import { HEALTH_RETRY_MS, probeServerHealth } from '../serverReady';
import { serverGateRequired, serverOrigin } from '../serverUrl';

/** Keep checking while the menu is mounted, including after a successful probe. One lost probe is not an outage. */
export function useServerReady() {
  const [ready, setReady] = useState(() => !serverGateRequired());
  useEffect(() => {
    if (!serverGateRequired()) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let misses = 0;
    async function check() {
      const ok = await probeServerHealth(serverOrigin(), fetch, controller.signal);
      if (controller.signal.aborted) return;
      misses = ok ? 0 : misses + 1;
      if (ok || misses >= 2) setReady(ok);
      timer = setTimeout(check, HEALTH_RETRY_MS);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return ready;
}
