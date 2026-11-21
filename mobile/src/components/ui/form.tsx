import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, gutter, palette, radius, space, touch } from "@/theme/tokens";
import { Icon } from "./icon";
import { AppText } from "./text";

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <AppText variant="smallStrong" tone="muted">{label}</AppText>
      {children}
      {error ? <AppText variant="caption" tone="danger">{error}</AppText> : help ? <AppText variant="caption" tone="faint">{help}</AppText> : null}
    </View>
  );
}

export function TextField({ label, help, error, multiline, style, ...props }: TextInputProps & { label: string; help?: string; error?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} help={help} error={error}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[styles.input, multiline && styles.multiline, focused && styles.focused, style]}
        {...props}
      />
    </Field>
  );
}

export type Option<T extends string> = { value: T; label: string; description?: string };

/** A labelled value that opens a bottom sheet of choices (native pattern for <select>). */
export function Select<T extends string>({ label, value, options, onChange, help, disabled }: { label: string; value: T; options: Option<T>[]; onChange: (value: T) => void; help?: string; disabled?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <Field label={label} help={help}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? "Choose"}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, styles.selectRow, pressed && { backgroundColor: colors.pressed }, disabled && styles.disabled]}
      >
        <AppText style={styles.flex} numberOfLines={1}>{current?.label ?? "Choose"}</AppText>
        <Icon name="chevronDown" size={14} color={colors.muted} />
      </Pressable>
      <OptionSheet title={label} visible={open} options={options} value={value} onClose={() => setOpen(false)} onSelect={(next) => { setOpen(false); onChange(next); }} />
    </Field>
  );
}

export function OptionSheet<T extends string>({ title, visible, options, value, onClose, onSelect }: { title: string; visible: boolean; options: Option<T>[]; value?: T; onClose: () => void; onSelect: (value: T) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.grab} />
        <View style={styles.sheetHead}>
          <AppText variant="title" style={styles.flex}>{title}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={onClose}><AppText variant="smallStrong" tone="accent">Done</AppText></Pressable>
        </View>
        <ScrollView style={styles.sheetList}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: option.value === value }}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.pressed }]}
            >
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{option.label}</AppText>
                {option.description ? <AppText variant="small" tone="muted">{option.description}</AppText> : null}
              </View>
              <View style={[styles.radio, option.value === value && { borderColor: colors.primary }]}>{option.value === value ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ToggleRow({ label, help, value, onChange, disabled }: { label: string; help?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {help ? <AppText variant="small" tone="muted">{help}</AppText> : null}
      </View>
      <AppSwitch label={label} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}

/**
 * The app's on/off switch. The off track uses the strong line colour: the
 * hairline colour nearly vanished on the dark page. iOS paints the off fill
 * from `ios_backgroundColor`, not from `trackColor.false`, so both are set.
 */
export function AppSwitch({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange}
      trackColor={{ true: colors.actions, false: colors.lineStrong }} ios_backgroundColor={colors.lineStrong} thumbColor={palette.white} />
  );
}

/** Checkbox-like row, for multi-select lists (mentions, condition checks). */
export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.check}>
      <View style={[styles.box, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{checked ? <Icon name="check" size={12} color={colors.onPrimary} /> : null}</View>
      <AppText variant="small" style={styles.flex}>{label}</AppText>
    </Pressable>
  );
}

/** Horizontal, scrollable segmented control for tabs and filters. */
export function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} style={styles.chipScroll} contentContainerStyle={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && { backgroundColor: colors.primary }]}
          >
            <AppText variant="smallStrong" style={{ color: selected ? colors.onPrimary : colors.ink }} numberOfLines={1}>
              {option.label}{option.count !== undefined ? ` ${option.count}` : ""}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Search box: a soft grey field with a magnifier, used at the top of lists. */
export function SearchField({ value, onChangeText, placeholder, label, onSubmit, autoFocus }: { value: string; onChangeText: (value: string) => void; placeholder: string; label: string; onSubmit?: () => void; autoFocus?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.search}>
      <Icon name="search" size={17} color={colors.faint} />
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.faint}
        returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false} autoCapitalize="none" maxLength={200} style={styles.searchInput}
        onSubmitEditing={onSubmit} autoFocus={autoFocus} />
    </View>
  );
}

/** Two to four equal choices in one grey track (Dates / Tasks, 30 days / 90 days). */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.seg} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[styles.segItem, selected && styles.segOn]}>
            <AppText variant="smallStrong" tone={selected ? "ink" : "muted"} numberOfLines={1}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A bottom sheet with a grab handle, for short choices and confirmations. */
export function Sheet({ title, visible, onClose, children, action }: { title: string; visible: boolean; onClose: () => void; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.grab} />
        <View style={styles.sheetHead}>
          <AppText variant="title" style={styles.flex}>{title}</AppText>
          {action ? <Pressable accessibilityRole="button" hitSlop={12} onPress={action.onPress}><AppText variant="smallStrong" tone="accent">{action.label}</AppText></Pressable> : null}
        </View>
        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = createStyles((c) => ({
  field: { gap: space.xs + 2 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: space.sm, color: c.ink, fontSize: 16, fontFamily: font.regular },
  multiline: { minHeight: 104, paddingTop: space.md },
  focused: { borderColor: c.focus, borderWidth: 1.5 },
  selectRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  disabled: { opacity: 0.5 },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm, maxHeight: "80%" },
  grab: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginBottom: space.md },
  sheetHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingBottom: space.sm },
  sheetList: { paddingHorizontal: gutter },
  sheetBody: { gap: space.lg, paddingBottom: space.sm },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 58, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.line },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10, minHeight: 58, borderBottomWidth: 1, borderBottomColor: c.line },
  check: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch + 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  chipScroll: { marginHorizontal: -gutter, flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: gutter },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.raised, justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 46, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.raised },
  searchInput: { flex: 1, color: c.ink, fontSize: 16, fontFamily: font.regular, paddingVertical: space.sm },
  seg: { flexDirection: "row", padding: 3, borderRadius: radius.md, backgroundColor: c.raised },
  segItem: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 3, paddingHorizontal: space.xs },
  segOn: { backgroundColor: c.segmentOn },
}));
