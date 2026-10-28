import { Stack, useLocalSearchParams } from 'expo-router';
import { WebPortalScreen } from '../src/components/WebPortalScreen';
import { knowledgePortalUrl } from '../src/navigation/knowledge-portals';
import { useI18n } from '../src/i18n/I18nProvider';

export default function KnowledgeScreen() {
  const { kind, item } = useLocalSearchParams<{ kind?: string; item?: string }>();
  const { t } = useI18n();
  const portal = kind === 'taiwan' ? 'taiwan' : kind === 'legal' ? 'legal' : 'immigration';
  const title = t(portal === 'taiwan' ? 'home.topicTaiwanTitle' : portal === 'legal' ? 'home.portalLegalTitle' : 'home.portalImmigrationTitle');
  return <>
    <Stack.Screen options={{ headerShown: true, title }} />
    <WebPortalScreen key={`${portal}:${item || ''}`} screenTestID={`screen-knowledge-${portal}`} webViewTestID={`${portal}-knowledge-webview`} brand={title} url={knowledgePortalUrl(portal, item)} allowedHosts={['trrb.net']} loadingText={title} errorTitle={title} errorBody={t('judgePortal.errorBody')} />
  </>;
}
