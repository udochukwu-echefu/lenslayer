import { View } from "react-native";
import { formatDate } from "@/lib/format";
import { recheckConnection, useIsOnline } from "@/lib/online";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { radius, space } from "@/theme/tokens";
import { Button } from "./button";
import { Icon } from "./icon";
import { AppText } from "./text";

/** Keeps a cached list readable and makes the write restriction explicit. */
export function OfflineBanner({ savedAt }: { savedAt?: number }) {
  const online = useIsOnline();
  const styles = useStyles();
  const { colors } = useTheme();
  if (online) return null;
  const time = savedAt ? formatDate(new Date(savedAt).toISOString(), { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <View style={styles.stack}>
      <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name="wifiOff" size={18} color={colors.canvas} />
        <AppText variant="small" style={styles.message}>You’re offline. {time ? `Showing what was saved at ${time}. ` : ""}Changes need a connection.</AppText>
      </View>
      <Button label="Try again" variant="secondary" onPress={() => void recheckConnection()} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  stack: { gap: space.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.ink },
  message: { flex: 1, color: c.canvas },
}));
