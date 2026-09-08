import { View } from 'react-native';
import CommunityScreen from '../community';
import { useI18n } from '../../src/i18n/I18nProvider';

export default function CommunityTabScreen() {
  const { t } = useI18n();
  return (
    <View testID="screen-america" accessibilityLabel={t('tab.america')} style={{ flex: 1 }}>
      <CommunityScreen embedded />
    </View>
  );
}
