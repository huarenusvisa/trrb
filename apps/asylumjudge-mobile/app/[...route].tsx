import { usePathname } from 'expo-router';
import { Text, View } from 'react-native';
import AccountSecurity from '../shared-mobile/app/account-security';
import Auth from '../shared-mobile/app/auth';
import ChangePassword from '../shared-mobile/app/change-password';
import Community from '../shared-mobile/app/community';
import DeleteAccount from '../shared-mobile/app/delete-account';
import Favorites from '../shared-mobile/app/favorites';
import FollowRequests from '../shared-mobile/app/follow-requests';
import ForgotPassword from '../shared-mobile/app/forgot-password';
import History from '../shared-mobile/app/history';
import LanguageSettings from '../shared-mobile/app/language-settings';
import Messages from '../shared-mobile/app/messages';
import MyComments from '../shared-mobile/app/my-comments';
import Notifications from '../shared-mobile/app/notifications';
import ProfileCompose from '../shared-mobile/app/profile-compose';
import ProfileSettings from '../shared-mobile/app/profile-settings';
import PushSettings from '../shared-mobile/app/push-settings';
import UserSearch from '../shared-mobile/app/user-search';
import Connections from '../shared-mobile/app/connections/[type]';
import Article from '../shared-mobile/app/article/[id]';
import Chat from '../shared-mobile/app/chat/[id]';
import CommunityPost from '../shared-mobile/app/community/[id]';
import UserProfile from '../shared-mobile/app/user/[id]';
import { useI18n } from '../shared-mobile/src/i18n/I18nProvider';

const ROUTES: Record<string, React.ComponentType> = {
  '/account-security': AccountSecurity,
  '/auth': Auth,
  '/change-password': ChangePassword,
  '/community': Community,
  '/delete-account': DeleteAccount,
  '/favorites': Favorites,
  '/follow-requests': FollowRequests,
  '/forgot-password': ForgotPassword,
  '/history': History,
  '/language-settings': LanguageSettings,
  '/messages': Messages,
  '/my-comments': MyComments,
  '/notifications': Notifications,
  '/profile-compose': ProfileCompose,
  '/profile-settings': ProfileSettings,
  '/push-settings': PushSettings,
  '/user-search': UserSearch,
  '/connections/followers': Connections,
  '/connections/following': Connections,
};

export default function SharedTangDailyRoute() {
  const { t } = useI18n();
  const pathname = usePathname();
  const Screen = ROUTES[pathname]
    || (pathname.startsWith('/article/') ? Article : undefined)
    || (pathname.startsWith('/chat/') ? Chat : undefined)
    || (pathname.startsWith('/community/') ? CommunityPost : undefined)
    || (pathname.startsWith('/user/') ? UserProfile : undefined);
  if (Screen) return <Screen />;
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>{t('asylumApp.errorTitle')}</Text></View>;
}
