import source from '../../../design/tokens.json';

const { colors } = source;
export const themes = {
  light: {
    primaryAction: colors.brand.teal,
    onPrimary: colors.surface.paper,
    surface: colors.surface.base,
    surfaceRaised: colors.surface.paper,
    textPrimary: colors.text.primary,
    textSecondary: colors.text.secondary,
    border: colors.text.secondary,
    positive: colors.semantic.success,
    warning: colors.brand.navy,
    warningSurface: colors.brand.amber,
    danger: colors.semantic.danger,
  },
  dark: {
    primaryAction: colors.brand.teal,
    onPrimary: colors.surface.paper,
    surface: colors.brand.navy,
    surfaceRaised: colors.brand.navy,
    textPrimary: colors.surface.paper,
    textSecondary: colors.surface.base,
    border: colors.surface.base,
    positive: colors.surface.paper,
    warning: colors.brand.navy,
    warningSurface: colors.brand.amber,
    danger: colors.surface.paper,
  },
} as const;
export const spacing = { xs: source.spacingPx[0]!, sm: source.spacingPx[1]!, md: source.spacingPx[2]!, lg: source.spacingPx[3]!, xl: source.spacingPx[4]!, xxl: source.spacingPx[5]! } as const;
export const radius = source.radiiPx[1]!;
export const typeScale = { title: 28, heading: 20, body: 16, label: 14 } as const;
export const touchTarget = { android: 48, ios: source.touchTargetMinPx } as const;
