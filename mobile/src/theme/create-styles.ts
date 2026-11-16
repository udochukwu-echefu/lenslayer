import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "./theme-provider";
import type { ColorTokens } from "./tokens";

/** The style-object shape StyleSheet.create accepts (React Native 0.88 types). */
type Styles = Parameters<typeof StyleSheet.create>[0];

/**
 * Declares a component's styles as a function of the colour tokens and returns
 * a hook. The StyleSheet is rebuilt only when the colour scheme changes.
 *
 *   const useStyles = createStyles((c) => ({ card: { backgroundColor: c.surface } }));
 *   const styles = useStyles();
 *
 * The `S & Styles` parameter type mirrors StyleSheet.create's own signature, so
 * values like flexDirection: "row" keep their literal types.
 */
export function createStyles<S extends Styles>(factory: (colors: ColorTokens) => S & Styles) {
  return function useStyles(): Readonly<S> {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
