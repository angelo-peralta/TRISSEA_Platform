import { Tabs } from 'expo-router';
import { usePreviewTabOptions } from '@trissea/mobile-ui';

export default function TabLayout() {
  const options = usePreviewTabOptions();
  return <Tabs screenOptions={options}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home" }} />
    <Tabs.Screen name="trips" options={{ title: "Trips", tabBarAccessibilityLabel: "Trips" }} />
    <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarAccessibilityLabel: "Earnings" }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarAccessibilityLabel: "Profile" }} />
  </Tabs>;
}
