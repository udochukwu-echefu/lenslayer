import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useTheme } from "@/theme/theme-provider";

type SymbolName = ComponentProps<typeof SymbolView>["name"];

/**
 * One semantic icon vocabulary for the app. Each name maps to an SF Symbol on
 * iOS and a Material Symbol on Android and web, so screens say "alert", not
 * "exclamationmark.triangle".
 */
const icons = {
  overview: { ios: "square.grid.2x2", android: "dashboard", web: "dashboard" },
  contracts: { ios: "doc.on.doc", android: "description", web: "description" },
  ask: { ios: "text.magnifyingglass", android: "manage_search", web: "manage_search" },
  renewals: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  settings: { ios: "gearshape", android: "settings", web: "settings" },
  bell: { ios: "bell", android: "notifications", web: "notifications" },
  plus: { ios: "plus", android: "add", web: "add" },
  chevronRight: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  chevronDown: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  check: { ios: "checkmark", android: "check", web: "check" },
  checkCircle: { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" },
  circle: { ios: "circle", android: "radio_button_unchecked", web: "radio_button_unchecked" },
  alert: { ios: "exclamationmark.triangle", android: "warning", web: "warning" },
  clock: { ios: "clock", android: "schedule", web: "schedule" },
  xCircle: { ios: "xmark.circle", android: "cancel", web: "cancel" },
  close: { ios: "xmark", android: "close", web: "close" },
  quote: { ios: "quote.opening", android: "format_quote", web: "format_quote" },
  send: { ios: "paperplane.fill", android: "send", web: "send" },
  download: { ios: "square.and.arrow.down", android: "download", web: "download" },
  share: { ios: "square.and.arrow.up", android: "share", web: "share" },
  trash: { ios: "trash", android: "delete", web: "delete" },
  person: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" },
  people: { ios: "person.2", android: "group", web: "group" },
  upload: { ios: "arrow.up.doc", android: "upload_file", web: "upload_file" },
  document: { ios: "doc.text", android: "article", web: "article" },
  link: { ios: "link", android: "link", web: "link" },
  copy: { ios: "doc.on.clipboard", android: "content_copy", web: "content_copy" },
  inbox: { ios: "tray", android: "inbox", web: "inbox" },
  chart: { ios: "chart.bar", android: "bar_chart", web: "bar_chart" },
  shield: { ios: "checkmark.shield", android: "verified_user", web: "verified_user" },
  checklist: { ios: "checklist", android: "checklist", web: "checklist" },
  dateClock: { ios: "calendar.badge.clock", android: "event_upcoming", web: "event_upcoming" },
  sync: { ios: "arrow.triangle.2.circlepath", android: "sync", web: "sync" },
  help: { ios: "questionmark.circle", android: "help", web: "help" },
  mail: { ios: "envelope", android: "mail", web: "mail" },
  key: { ios: "key", android: "key", web: "key" },
  chat: { ios: "text.bubble", android: "chat", web: "chat" },
  mention: { ios: "at", android: "alternate_email", web: "alternate_email" },
  arrowRight: { ios: "arrow.right", android: "arrow_forward", web: "arrow_forward" },
  signOut: { ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" },
  appearance: { ios: "circle.lefthalf.filled", android: "contrast", web: "contrast" },
  sort: { ios: "arrow.up.arrow.down", android: "swap_vert", web: "swap_vert" },
  money: { ios: "banknote", android: "payments", web: "payments" },
  layers: { ios: "square.stack.3d.up", android: "layers", web: "layers" },
  reply: { ios: "arrowshape.turn.up.left", android: "reply", web: "reply" },
  history: { ios: "clock.arrow.circlepath", android: "history", web: "history" },
  switch: { ios: "arrow.left.arrow.right", android: "swap_horiz", web: "swap_horiz" },
  stop: { ios: "stop.circle", android: "stop_circle", web: "stop_circle" },
  lock: { ios: "lock", android: "lock", web: "lock" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  chevronLeft: { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
  more: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  info: { ios: "info.circle", android: "info", web: "info" },
  building: { ios: "building.2", android: "apartment", web: "apartment" },
  data: { ios: "externaldrive", android: "storage", web: "storage" },
  faceId: { ios: "faceid", android: "face", web: "face" },
  external: { ios: "arrow.up.right", android: "open_in_new", web: "open_in_new" },
  flag: { ios: "flag", android: "flag", web: "flag" },
  bolt: { ios: "bolt", android: "bolt", web: "bolt" },
  pencil: { ios: "pencil", android: "edit", web: "edit" },
  wifiOff: { ios: "wifi.slash", android: "wifi_off", web: "wifi_off" },
  eye: { ios: "eye", android: "visibility", web: "visibility" },
  arrowUp: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  overviewFill: { ios: "square.grid.2x2.fill", android: "dashboard", web: "dashboard" },
  contractsFill: { ios: "doc.on.doc.fill", android: "description", web: "description" },
  settingsFill: { ios: "gearshape.fill", android: "settings", web: "settings" },
  slider: { ios: "slider.horizontal.3", android: "tune", web: "tune" },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <SymbolView name={icons[name]} size={size} tintColor={color ?? colors.ink} />;
}
