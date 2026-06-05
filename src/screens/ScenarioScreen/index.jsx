import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Btn from '../../components/Btn';
import ScenarioExplorer from '../../components/ScenarioExplorer';

export default function ScenarioScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Btn onClick={() => navigate(-1)} subtle>
          {t('nav.back')}
        </Btn>
        <h1 className="text-xl font-bold">{t('scenario.title')}</h1>
      </div>
      <ScenarioExplorer />
    </div>
  );
}
