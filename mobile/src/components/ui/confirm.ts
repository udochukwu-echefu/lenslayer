import { Alert, Platform } from "react-native";

/**
 * Asks before a destructive or irreversible action. Native uses the system
 * alert; the browser preview uses window.confirm.
 */
export function confirm(title: string, message: string, confirmLabel = "Confirm", destructive = true): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
