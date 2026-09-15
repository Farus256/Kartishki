import { useEffect, useState } from 'react';
import { HEALTH_RETRY_MS, probeServerHealth } from '../serverReady';
import { serverGateRequired, serverOrigin } from '../serverUrl';

/** Keep checking while the menu is mounted, including after a successful probe. */
export function useServerReady() {
  const [ready, setReady] = useState(() => !serverGateRequired());
  useEffect(() => {
    if (!serverGateRequired()) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const ok = await probeServerHealth(serverOrigin(), fetch, controller.signal);
      if (controller.signal.aborted) return;
      setReady(ok);
      timer = setTimeout(check, HEALTH_RETRY_MS);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return ready;
}
