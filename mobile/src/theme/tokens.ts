import { Platform } from "react-native";

/**
 * LensLayer mobile tokens, matching the approved design canvas (clean pass,
 * Nov 2026): a white page, plain rows split by hairlines, one soft grey fill
 * for the few things that need a container, and four pastels keyed to
 * destinations (never to risk or confidence).
 */
export const palette = {
  charcoal: "#191A17",
  white: "#FFFFFF",
  cream: "#FAF4E6",
  pink: "#F5B8DA",
  butter: "#F6D868",
  olive: "#9AA963",
  blue: "#B5C9E8",
  rose: "#834965",
  pinkSoft: "#F8E5EC",
  butterSoft: "#FAF0C5",
  oliveSoft: "#E9ECD9",
  blueSoft: "#E6EDF5",
} as const;

export type ColorTokens = {
  canvas: string;
  surface: string;
  raised: string;
  well: string;
  pressed: string;
  line: string;
  lineStrong: string;
  ink: string;
  muted: string;
  faint: string;
  primary: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  focus: string;
  good: string;
  goodSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  contracts: string;
  decisions: string;
  actions: string;
  dates: string;
  onCategory: string;
  tabBar: string;
  /** Pill behind the selected tab. In dark mode it must be lighter than the bar, not darker. */
  tabActive: string;
  /** The selected half of a segmented control: always lighter than its track. */
  segmentOn: string;
  shadow: string;
};

export const lightColors: ColorTokens = {
  canvas: palette.white,
  surface: palette.white,
  raised: "#F6F5F2",
  well: "#F2F1ED",
  pressed: "#EFEEEA",
  line: "#EDEBE5",
  lineStrong: "#CFCBC0",
  ink: palette.charcoal,
  muted: "#66635A",
  faint: "#8A867B",
  primary: palette.charcoal,
  onPrimary: palette.white,
  accent: palette.rose,
  accentSoft: palette.pinkSoft,
  focus: palette.rose,
  good: "#48602F",
  goodSoft: palette.oliveSoft,
  warning: "#805C15",
  warningSoft: palette.butterSoft,
  danger: "#A13C36",
  dangerSoft: "#F6E0DC",
  info: "#3D5A86",
  infoSoft: palette.blueSoft,
  contracts: palette.butter,
  decisions: palette.pink,
  actions: palette.olive,
  dates: palette.blue,
  onCategory: palette.charcoal,
  tabBar: palette.white,
  tabActive: "#F6F5F2",
  segmentOn: palette.white,
  shadow: "rgba(25,26,23,0.14)",
};

export const darkColors: ColorTokens = {
  canvas: "#0E0E10",
  surface: "#0E0E10",
  raised: "#1E1D1A",
  well: "#26251F",
  pressed: "#2C2B25",
  line: "#2A2924",
  lineStrong: "#5C5950",
  ink: palette.cream,
  muted: "#C9C2B3",
  faint: "#9A9486",
  primary: palette.pink,
  onPrimary: palette.charcoal,
  accent: palette.pink,
  accentSoft: "#46303B",
  focus: palette.pink,
  good: "#A8C68A",
  goodSoft: "#2C3324",
  warning: palette.butter,
  warningSoft: "#36301D",
  danger: "#F2A094",
  dangerSoft: "#3A2422",
  info: "#AFC6F0",
  infoSoft: "#252D3A",
  contracts: palette.butter,
  decisions: palette.pink,
  actions: palette.olive,
  dates: palette.blue,
  onCategory: palette.charcoal,
  tabBar: "#1A1A1C",
  tabActive: "#33322C",
  segmentOn: "#3A3933",
  shadow: "rgba(0,0,0,0.5)",
};

/** 4pt grid. Screen gutter is `gutter`; sections sit `section` apart. Touch targets stay at or above 44pt. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const gutter = 20;
export const section = 28;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const touch = 44;
/** Clear space a scrolling screen leaves so the floating tab bar never covers content. */
export const tabBarClearance = 104;

/**
 * Figtree, loaded in the root layout. React Native picks a custom font by
 * family name, not by fontWeight, so each weight is its own family.
 */
export const font = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
} as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontFamily: font.bold, letterSpacing: -0.5 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: font.semibold, letterSpacing: -0.2 },
  number: { fontSize: 22, lineHeight: 28, fontFamily: font.semibold, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  heading: { fontSize: 17, lineHeight: 23, fontFamily: font.semibold },
  body: { fontSize: 16, lineHeight: 23, fontFamily: font.regular },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontFamily: font.medium },
  small: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  smallStrong: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: font.medium },
  /** Section label: sentence case and muted. Uppercase read as loud in the design review. */
  eyebrow: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
} as const;

export type TypeVariant = keyof typeof type;
