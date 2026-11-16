import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { titleCase } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, radius, space, touch } from "@/theme/tokens";
import { AppText, Button, Icon, Sheet } from "./ui";

/**
 * The workspace name in the Overview header. Tapping it opens a sheet listing
 * every workspace you belong to with your role in each. Roles can differ per
 * workspace; switching never widens one.
 */
export function WorkspaceSwitcher() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { organizations, activeOrganization, selectOrganization } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Workspace ${activeOrganization?.name ?? ""}. Switch workspace`} onPress={() => setOpen(true)} hitSlop={8} style={styles.trigger}>
        <AppText style={styles.name} numberOfLines={1}>{activeOrganization?.name ?? "Workspace"}</AppText>
        <Icon name="chevronDown" size={11} color={colors.muted} />
      </Pressable>
      <Sheet title="Switch workspace" visible={open} onClose={() => setOpen(false)}>
        <View>
          {organizations.map((item, index) => {
            const selected = item.id === activeOrganization?.id;
            return (
              <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setOpen(false); selectOrganization(item.id); }}
                style={[styles.row, index < organizations.length - 1 && styles.divider]}>
                <View style={styles.monogram}><AppText style={styles.monogramText}>{monogram(item.name)}</AppText></View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{item.name}</AppText>
                  <AppText variant="small" tone="muted">{titleCase(item.role ?? "member")}</AppText>
                </View>
                <View style={[styles.radio, selected && { borderColor: colors.primary }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" tone="faint">Your role can differ in each workspace. Switching never widens it.</AppText>
        <Button label="Create a workspace" icon="plus" variant="secondary" onPress={() => { setOpen(false); router.push("/new/workspace"); }} />
      </Sheet>
    </>
  );
}

function monogram(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "W").slice(0, 2)).toUpperCase();
}

const useStyles = createStyles((c) => ({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: touch, maxWidth: 220 },
  name: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: space.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  monogram: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" },
  monogramText: { fontFamily: font.bold, fontSize: 12 },
  flex: { flex: 1, gap: space.xxs },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
}));
