import { Text, type TextProps } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { type, type TypeVariant , ColorTokens } from "@/theme/tokens";

export type Tone = "ink" | "muted" | "faint" | "accent" | "danger" | "good" | "warning" | "info" | "onPrimary";

const toneColor = (colors: ColorTokens, tone: Tone) =>
  ({ ink: colors.ink, muted: colors.muted, faint: colors.faint, accent: colors.accent, danger: colors.danger, good: colors.good, warning: colors.warning, info: colors.info, onPrimary: colors.onPrimary })[tone];

/** Every piece of text in the app goes through this, so type and colour stay on the scale. */
export function AppText({ variant = "body", tone = "ink", style, ...props }: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const { colors } = useTheme();
  return <Text {...props} style={[type[variant], { color: toneColor(colors, tone) }, style]} />;
}
