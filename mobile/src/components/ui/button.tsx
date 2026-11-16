import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, radius, space } from "@/theme/tokens";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * One primary (filled) action per screen. Secondary is an outline, ghost is a
 * text link in the accent colour, danger is an outline with red text.
 */
export function Button({ label, variant = "primary", icon, loading, compact, disabled, onPress, style, ...props }: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const foreground = variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.danger : variant === "ghost" ? colors.accent : colors.ink;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={(event) => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={({ pressed }) => [styles.base, compact && styles.compact, styles[variant], pressed && styles.pressed, inactive && styles.disabled, style]}
      {...props}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Icon name={icon} size={compact ? 15 : 17} color={foreground} /> : null}
        <AppText style={[compact ? styles.labelCompact : styles.label, { color: foreground }]} numberOfLines={1}>{label}</AppText>
      </View>
    </Pressable>
  );
}

const useStyles = createStyles((c) => ({
  base: { minHeight: 52, borderRadius: radius.lg - 2, paddingHorizontal: space.xl - 4, justifyContent: "center", alignItems: "center" },
  compact: { minHeight: 38, borderRadius: radius.md, paddingHorizontal: space.md + 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  labelCompact: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  primary: { backgroundColor: c.primary },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.lineStrong },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.lineStrong },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
}));
