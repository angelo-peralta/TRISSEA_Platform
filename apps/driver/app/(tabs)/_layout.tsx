import { Tabs } from 'expo-router';
import { useTheme } from '@trissea/mobile-ui';

export default function TabLayout() {
  const theme = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.textPrimary, tabBarInactiveTintColor: theme.textSecondary, tabBarStyle: { backgroundColor: theme.surfaceRaised, borderTopColor: theme.border } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home" }} />
    <Tabs.Screen name="trips" options={{ title: "Trips", tabBarAccessibilityLabel: "Trips" }} />
    <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarAccessibilityLabel: "Earnings" }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarAccessibilityLabel: "Profile" }} />
  </Tabs>;
}
