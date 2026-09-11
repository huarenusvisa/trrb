import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../../src/auth/supabase';
import { WebPortalScreen } from '../../src/components/WebPortalScreen';
import { useI18n } from '../../src/i18n/I18nProvider';

const COMMUNITY_URL = 'https://trrb.net/community/?app=1';
const SESSION_STORAGE_KEY = 'sb-fwiznbpsqkfgkvyznebz-auth-token';

export default function CommunityTabScreen() {
  const { t } = useI18n();
  const [sessionScript, setSessionScript] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const sync = (session: unknown) => { if (active) setSessionScript(`window.localStorage.setItem('${SESSION_STORAGE_KEY}', ${JSON.stringify(JSON.stringify(session))}); true;`); };
    void supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => sync(session));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (sessionScript === null) return <View testID="screen-america" style={{ flex:1,alignItems:'center',justifyContent:'center' }}><ActivityIndicator color="#b4232d" /></View>;
  return <WebPortalScreen key={sessionScript} accessibilityLabel={t('tab.america')} screenTestID="screen-america" webViewTestID="community-portal-webview" brand="唐人社区" url={COMMUNITY_URL} allowedHosts={['trrb.net']} loadingText="正在打开唐人社区…" errorTitle="唐人社区暂时无法打开" errorBody="请检查网络后重试，或改用浏览器打开。" injectedJavaScriptBeforeContentLoaded={sessionScript} />;
}
