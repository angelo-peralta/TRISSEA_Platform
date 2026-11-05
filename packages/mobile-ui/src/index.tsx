import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, themes, touchTarget, typeScale } from '@trissea/design-tokens';

export function useTheme() { return themes[useColorScheme() === 'dark' ? 'dark' : 'light']; }

function PreviewTabLabel({ children, color }: { children: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: typeScale.label, textAlign: 'center' }}>{children}</Text>;
}

/** Text tabs avoid missing icon fonts and leave room for two scaled label lines. */
export function usePreviewTabOptions() {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: theme.textPrimary,
    tabBarInactiveTintColor: theme.textSecondary,
    tabBarIconStyle: { display: 'none' as const },
    tabBarLabel: PreviewTabLabel,
    tabBarItemStyle: { paddingHorizontal: 0, paddingVertical: 0 },
    tabBarStyle: {
      backgroundColor: theme.surfaceRaised,
      borderTopColor: theme.border,
      height: Math.max(touchTarget.android + spacing.sm, Math.ceil(typeScale.label * fontScale * 3 + spacing.lg)) + insets.bottom,
    },
  };
}

/** Scrollable, font-scaling-safe shell. Does not fetch or infer operational state. */
export function AppScreen({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.surface }]}>
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>TRISSEA · TUGUEGARAO</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <View style={[styles.notice, { backgroundColor: theme.warningSurface }]}>
        <Text style={[styles.body, { color: theme.warning }]}>Development preview · No live ride services</Text>
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function InfoSection({ title, children }: { title: string; children: string }) {
  const theme = useTheme();
  return <View style={[styles.section, { borderColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.textPrimary }]}>{title}</Text>
    <Text style={[styles.body, { color: theme.textSecondary }]}>{children}</Text>
  </View>;
}

/** One clearly labeled action; pending/disabled state is exposed to screen readers. */
export function AppButton({ label, onPress, disabled = false, busy = false }: { label: string; onPress?: () => void; disabled?: boolean; busy?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: disabled || busy ? theme.surfaceRaised : theme.primaryAction, borderColor: theme.border, borderWidth: pressed ? 2 : 1, minHeight: Platform.OS === 'ios' ? touchTarget.ios : touchTarget.android }]}>
    <Text style={[styles.buttonLabel, { color: disabled || busy ? theme.textSecondary : theme.onPrimary }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  eyebrow: { fontSize: typeScale.label, fontWeight: '600' },
  title: { fontSize: typeScale.title, fontWeight: '700' },
  heading: { fontSize: typeScale.heading, fontWeight: '600' },
  body: { fontSize: typeScale.body, lineHeight: 26 },
  section: { padding: spacing.lg, borderWidth: 1, borderRadius: radius, gap: spacing.md },
  notice: { padding: spacing.lg, borderRadius: radius },
  button: { padding: spacing.lg, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: typeScale.body, fontWeight: '600', textAlign: 'center' },
});
