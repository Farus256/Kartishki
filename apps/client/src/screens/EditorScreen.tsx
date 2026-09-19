import { useTranslation } from 'react-i18next';
import { EDITOR_URL } from '../features';
import { Backdrop } from '../ui/Backdrop';
import { BackButton } from '../ui/BackButton';
import { TopBar } from '../ui/TopBar';

/** The card-set editor inside the game: the editor app in a frame, so Workshop authors never leave the client. */
export function EditorScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return <div className="absolute inset-0 overflow-clip">
    <Backdrop />
    <TopBar right={<BackButton onClick={onBack} />} />
    <div className="shop-title"><span>{t('menuEditor')}</span></div>
    <iframe className="editor-frame" title={t('menuEditor')} src={EDITOR_URL} data-testid="editor-frame" />
  </div>;
}
