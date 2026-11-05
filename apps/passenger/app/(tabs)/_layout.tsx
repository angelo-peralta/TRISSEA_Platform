import { Tabs } from 'expo-router';
import { useTheme } from '@trissea/mobile-ui';

export default function TabLayout() {
  const theme = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.textPrimary, tabBarInactiveTintColor: theme.textSecondary, tabBarStyle: { backgroundColor: theme.surfaceRaised, borderTopColor: theme.border } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home" }} />
    <Tabs.Screen name="activity" options={{ title: "Activity", tabBarAccessibilityLabel: "Activity" }} />
    <Tabs.Screen name="account" options={{ title: "Account", tabBarAccessibilityLabel: "Account" }} />
  </Tabs>;
}
