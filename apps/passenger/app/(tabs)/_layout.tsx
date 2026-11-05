import { Tabs } from 'expo-router';
import { usePreviewTabOptions } from '@trissea/mobile-ui';

export default function TabLayout() {
  const options = usePreviewTabOptions();
  return <Tabs screenOptions={options}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home" }} />
    <Tabs.Screen name="activity" options={{ title: "Activity", tabBarAccessibilityLabel: "Activity" }} />
    <Tabs.Screen name="account" options={{ title: "Account", tabBarAccessibilityLabel: "Account" }} />
  </Tabs>;
}
