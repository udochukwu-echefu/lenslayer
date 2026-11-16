import { View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { AppText } from "./ui";

/**
 * The LensLayer mark drawn with plain views (two stacked pages and a lens),
 * matching .brand-mark in the dashboard's globals.css. No image asset needed,
 * and it recolours with the theme.
 */
export function BrandMark({ size = 30, showName = true, color }: { size?: number; showName?: boolean; color?: string }) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  const s = size / 30;
  const page = { position: "absolute" as const, width: 15 * s, height: 19 * s, borderWidth: 1.5 * s, borderColor: tint, borderRadius: 3 * s, backgroundColor: colors.surface };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessible accessibilityLabel="LensLayer">
      <View style={{ width: size, height: size }}>
        <View style={[page, { top: 3 * s, left: 5 * s, opacity: 0.7 }]} />
        <View style={[page, { top: 7 * s, left: 10 * s }]} />
        <View style={{ position: "absolute", top: 10 * s, left: 13 * s, width: 7 * s, height: 7 * s, borderWidth: 2 * s, borderColor: tint, borderRadius: 99, backgroundColor: colors.surface }} />
      </View>
      {showName ? <AppText variant="heading">LensLayer</AppText> : null}
    </View>
  );
}
