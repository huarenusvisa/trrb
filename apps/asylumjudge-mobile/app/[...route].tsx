import { usePathname } from 'expo-router';
import { Text, View } from 'react-native';
import AccountSecurity from '../../mobile/app/account-security';
import Auth from '../../mobile/app/auth';
import ChangePassword from '../../mobile/app/change-password';
import Community from '../../mobile/app/community';
import DeleteAccount from '../../mobile/app/delete-account';
import Favorites from '../../mobile/app/favorites';
import FollowRequests from '../../mobile/app/follow-requests';
import ForgotPassword from '../../mobile/app/forgot-password';
import History from '../../mobile/app/history';
import LanguageSettings from '../../mobile/app/language-settings';
import Messages from '../../mobile/app/messages';
import MyComments from '../../mobile/app/my-comments';
import Notifications from '../../mobile/app/notifications';
import ProfileCompose from '../../mobile/app/profile-compose';
import ProfileSettings from '../../mobile/app/profile-settings';
import PushSettings from '../../mobile/app/push-settings';
import UserSearch from '../../mobile/app/user-search';
import Followers from '../../mobile/app/connections/followers';
import Following from '../../mobile/app/connections/following';
import Article from '../../mobile/app/article/[id]';
import Chat from '../../mobile/app/chat/[id]';
import CommunityPost from '../../mobile/app/community/[id]';
import UserProfile from '../../mobile/app/user/[id]';

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
  '/connections/followers': Followers,
  '/connections/following': Following,
};

export default function SharedTangDailyRoute() {
  const pathname = usePathname();
  const Screen = ROUTES[pathname]
    || (pathname.startsWith('/article/') ? Article : undefined)
    || (pathname.startsWith('/chat/') ? Chat : undefined)
    || (pathname.startsWith('/community/') ? CommunityPost : undefined)
    || (pathname.startsWith('/user/') ? UserProfile : undefined);
  if (Screen) return <Screen />;
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>页面暂时无法打开</Text></View>;
}
