import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion } from '../autoBattlerSession';
import { MinionTile } from './MinionTile';
import { useEffect, useRef } from 'react';

type Props = {
  options: AbMinion[];
  catalog: AutoBattlerCatalog;
  onPick: (id: string) => void;
};

export function DiscoverModal({ options, catalog, onPick }: Props) {
  const { t } = useTranslation();
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return()=>previous?.focus();
  },[]);
  if (!options.length) return null;
  return (
    <div ref={dialog} className="ab-modal" role="dialog" aria-modal="true" aria-label={t('abDiscover')} data-testid="ab-discover"
      onKeyDown={event=>{
        if(event.key!=='Tab')return;
        const choices=[...dialog.current!.querySelectorAll<HTMLButtonElement>('button')];
        const first=choices[0],last=choices.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }}>
      <div className="ab-modal-card">
        <h2>{t('abDiscover')}</h2>
        <div className="ab-discover-row">
          {options.map((option, index) => (
            <MinionTile key={option.id} minion={option} catalog={catalog} fullCard actionLabel={t('abPick')} arriveDelay={index * 70} onClick={() => onPick(option.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
