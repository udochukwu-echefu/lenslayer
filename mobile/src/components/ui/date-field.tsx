import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { formatDate } from "@/lib/format";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { radius, space, touch } from "@/theme/tokens";
import { Button } from "./button";
import { Field } from "./form";
import { Icon } from "./icon";
import { AppText } from "./text";

/** Native date (and optional time) picker. `date-field.web.tsx` is the browser version. */
export function DateField({ label, value, onChange, withTime, help, optional }: { label: string; value: Date | null; onChange: (value: Date | null) => void; withTime?: boolean; help?: string; optional?: boolean }) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const display = value ? formatDate(value.toISOString(), withTime ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" } : undefined) : "Not set";
  return (
    <Field label={label} help={help}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${display}`} onPress={() => setOpen("date")} style={[styles.input, styles.flex]}>
          <Icon name="renewals" size={16} color={colors.muted} />
          <AppText tone={value ? "ink" : "faint"}>{display}</AppText>
        </Pressable>
        {optional && value ? <Button label="Clear" variant="ghost" compact onPress={() => onChange(null)} /> : null}
      </View>
      {open ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode={open}
          themeVariant={scheme}
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(event, selected) => {
            if (event.type === "dismissed" || !selected) { setOpen(null); return; }
            onChange(selected);
            if (Platform.OS === "android") setOpen(withTime && open === "date" ? "time" : null);
          }}
        />
      ) : null}
      {open && Platform.OS === "ios" ? <Button label="Done" variant="secondary" compact onPress={() => setOpen(withTime && open === "date" ? "time" : null)} /> : null}
    </Field>
  );
}

const useStyles = createStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  input: { minHeight: touch, borderRadius: radius.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
}));
