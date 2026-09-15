import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { HEALTH_MANUAL_MS, HEALTH_RETRY_MS, HEALTH_WAKING_MS, probeServerHealth } from '../serverReady';
import { serverGateRequired, serverOrigin } from '../serverUrl';
import { Backdrop } from '../ui/Backdrop';
import { InkButton, spring } from '../ui/InkButton';
import { Stage } from '../ui/Stage';

export function WakeScreen({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const [waking, setWaking] = useState(false);
  const [manual, setManual] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!serverGateRequired()) { onReadyRef.current(); return; }
    let live = true;
    const wait = () => { timer.current = setTimeout(() => { void check(); }, HEALTH_RETRY_MS); };
    async function check() {
      if (await probeServerHealth(serverOrigin())) {
        if (live) onReadyRef.current();
        return;
      }
      if (live) wait();
    }
    void check();
    const wakingAt = setTimeout(() => { if (live) setWaking(true); }, HEALTH_WAKING_MS);
    const manualAt = setTimeout(() => { if (live) setManual(true); }, HEALTH_MANUAL_MS);
    return () => {
      live = false;
      clearTimeout(timer.current);
      clearTimeout(wakingAt);
      clearTimeout(manualAt);
    };
  }, []);

  return (
    <Stage>
      <div className="absolute inset-0 text-paper">
        <Backdrop tone="noir" />
        <motion.div className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <div className="ink-edge w-[640px] border-[4px] border-paper/40 bg-black/50 p-10 text-center shadow-[10px_12px_0_rgba(0,0,0,.55)]">
            <span className="font-mono text-[12px] tracking-[6px] text-paper/55">{t('caseFile')}</span>
            <h1 className="mt-3 font-hand text-[56px] leading-none tracking-[2px]">{t('title')}<span className="ml-3 inline-block rotate-12 text-blood">✳</span></h1>
            <p role="status" className="mt-8 font-hand text-[32px] text-paper/90">{t('serverConnecting')}</p>
            {waking && <p className="mt-3 font-mono text-[13px] leading-relaxed text-paper/60">{t('serverWaking')}</p>}
            {manual && (
              <div className="mt-8 flex justify-center">
                <InkButton tone="paper" onClick={() => { void probeServerHealth(serverOrigin()).then(ok => { if (ok) onReadyRef.current(); }); }}>
                  {t('retry')}
                </InkButton>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </Stage>
  );
}
