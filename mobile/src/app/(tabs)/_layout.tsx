import { TabList, Tabs, TabSlot, TabTrigger, useTabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import * as Haptics from "expo-haptics";
import { createContext, use, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, View, type GestureResponderEvent, type LayoutRectangle, type ViewProps } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { AppText, Icon, type IconName } from "@/components/ui";
import { useTaskCounts } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font } from "@/theme/tokens";

const destinations = [
  { name: "overview", href: "/", icon: "overview", activeIcon: "overviewFill", label: "Overview" },
  { name: "contracts", href: "/contracts", icon: "contracts", activeIcon: "contractsFill", label: "Agreements" },
  { name: "ask", href: "/ask", icon: "ask", label: "Ask" },
  { name: "renewals", href: "/renewals", icon: "renewals", label: "Renewals" },
  { name: "settings", href: "/settings", icon: "slider", label: "Settings" },
] as const;

type DestinationName = typeof destinations[number]["name"];
type TabFrames = Partial<Record<DestinationName, LayoutRectangle>>;

const glide = { stiffness: 470, damping: 34, mass: 0.7, overshootClamping: true, reduceMotion: ReduceMotion.System };
const shape = { stiffness: 580, damping: 25, mass: 0.48, reduceMotion: ReduceMotion.System };

const dragThreshold = 24;
const verticalTolerance = 14;

const TabPressFeedback = createContext<((pressed: boolean) => void) | null>(null);

/**
 * The five destinations from the dashboard's sidebar, in a floating pill tab
 * bar (the approved design). Expo Router's headless tabs (`expo-router/ui`)
 * give us the navigation behaviour and leave the drawing to us: `TabSlot`
 * renders the current tab, `TabList` is the bar, and each `TabTrigger` is a
 * button. Every folder holds a Stack, so each tab keeps its own back history.
 */
export default function TabsLayout() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { organizationId } = useWorkspace();
  const counts = useTaskCounts(organizationId);
  const overdue = counts.data?.overdue_tasks ?? 0;
  const [frames, setFrames] = useState<TabFrames>({});

  function measureTab(name: DestinationName, frame: LayoutRectangle) {
    setFrames((previous) => {
      const current = previous[name];
      if (current && current.x === frame.x && current.y === frame.y && current.width === frame.width && current.height === frame.height) {
        return previous;
      }
      return { ...previous, [name]: frame };
    });
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Tabs>
        <TabSlot />
        <TabList asChild style={[styles.bar, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
          <MotionTabBar frames={frames}>
            {destinations.map((destination) => (
              <TabTrigger key={destination.name} name={destination.name} href={destination.href} asChild>
                <TabButton
                  icon={destination.icon}
                  activeIcon={"activeIcon" in destination ? destination.activeIcon : undefined}
                  label={destination.label}
                  badge={destination.name === "renewals" ? overdue : undefined}
                  measured={Boolean(frames[destination.name]?.width)}
                  onLayout={(event) => measureTab(destination.name, event.nativeEvent.layout)}
                />
              </TabTrigger>
            ))}
          </MotionTabBar>
        </TabList>
      </Tabs>
    </GestureHandlerRootView>
  );
}

/** The navigator owns selection. Touches can preview it without mounting intermediate screens. */
function MotionTabBar({ frames, children, ...props }: ViewProps & { frames: TabFrames }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const { getTrigger, switchTab } = useTabTrigger({ name: "overview" });
  const selected = destinations.find(({ name }) => getTrigger(name)?.isFocused);
  const frame = selected && frames[selected.name];
  const activeX = frame?.width ? frame.x : undefined;
  const positioned = useRef(false);
  const offset = useSharedValue(0);
  const stretch = useSharedValue(1);
  const scrubbing = useSharedValue(false);
  const tabs = destinations.flatMap(({ name }) => {
    const tabFrame = frames[name];
    return tabFrame?.width ? [{ name, ...tabFrame }] : [];
  });
  const left = Math.min(...tabs.map((tab) => tab.x));
  const right = Math.max(...tabs.map((tab) => tab.x));
  const halfWidth = (tabs[0]?.width ?? 0) / 2;

  useLayoutEffect(() => {
    if (activeX === undefined) return;
    offset.set(positioned.current ? withSpring(activeX, glide) : activeX);
    positioned.current = true;
  }, [activeX, offset]);

  function navigate(name: DestinationName) {
    if (getTrigger(name)?.isFocused) return;
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    switchTab(name, {});
  }

  const drag = usePanGesture({
    enabled: tabs.length === destinations.length,
    // Leave room for thumb drift when tapping near a tab boundary.
    activeOffsetX: [-dragThreshold, dragThreshold],
    failOffsetY: [-verticalTolerance, verticalTolerance],
    maxPointers: 1,
    onActivate: () => {
      "worklet";
      scrubbing.set(true);
      if (!reduceMotion) stretch.set(withSpring(1.06, shape));
    },
    onUpdate: ({ x }) => {
      "worklet";
      if (reduceMotion) return;
      offset.set(Math.max(left, Math.min(right, x - halfWidth)));
    },
    onDeactivate: ({ x, canceled, velocityX }) => {
      "worklet";
      scrubbing.set(false);
      stretch.set(withSpring(1, shape));
      if (canceled) {
        if (activeX !== undefined) offset.set(withSpring(activeX, glide));
        return;
      }

      const closest = tabs.reduce((nearest, tab) =>
        Math.abs(x - tab.x - tab.width / 2) < Math.abs(x - nearest.x - nearest.width / 2) ? tab : nearest
      );
      const distance = closest.x - offset.get();
      const velocity = Math.sign(distance) === Math.sign(velocityX)
        ? Math.sign(distance) * Math.min(Math.abs(velocityX), Math.abs(distance) * 18, 850)
        : 0;
      offset.set(withSpring(closest.x, { ...glide, velocity }));
      scheduleOnRN(navigate, closest.name);
    },
  });

  const motion = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }, { scaleX: stretch.get() }],
  }));

  function setPressed(pressed: boolean) {
    if (reduceMotion || scrubbing.get()) return;
    stretch.set(withSpring(pressed ? 1.04 : 1, shape));
  }

  return (
    <TabPressFeedback.Provider value={setPressed}>
      <GestureDetector gesture={drag} touchAction="pan-y">
        <SafeAreaView {...props} edges={{ left: "additive", right: "additive" }}>
          {frame?.width ? (
            <Animated.View
              testID="tab-selection-indicator"
              pointerEvents="none"
              accessible={false}
              style={[styles.indicator, { top: frame.y, width: frame.width, height: frame.height }, motion]}
            />
          ) : null}
          {children}
        </SafeAreaView>
      </GestureDetector>
    </TabPressFeedback.Provider>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  activeIcon?: IconName;
  label: string;
  badge?: number;
  measured: boolean;
};

// A browser may synthesize its click on the neighboring tab after a touch ends.
function useWebTabTouch() {
  const start = useRef<{ clientX: number; clientY: number } | null>(null);

  function isTap(touch: Touch) {
    return start.current !== null
      && Math.abs(touch.clientX - start.current.clientX) < dragThreshold
      && Math.abs(touch.clientY - start.current.clientY) < verticalTolerance;
  }

  function trackTouch(event: GestureResponderEvent) {
    const touches = (event.nativeEvent as unknown as TouchEvent).touches;
    const touch = touches.length === 1 ? touches[0] : undefined;
    start.current = touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
  }

  function trackMovement(event: GestureResponderEvent) {
    const touch = (event.nativeEvent as unknown as TouchEvent).changedTouches[0];
    if (!touch || !isTap(touch)) start.current = null;
  }

  function finishTouch(event: GestureResponderEvent) {
    const touch = (event.nativeEvent as unknown as TouchEvent).changedTouches[0];
    const tapped = touch && isTap(touch);
    start.current = null;
    if (!touch) return;

    const button = event.currentTarget as unknown as HTMLElement;
    const releasedOver = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[role="tab"]');
    if (!releasedOver || button === releasedOver) return;

    event.preventDefault();
    if (tapped) button.click();
  }

  if (Platform.OS !== "web") return undefined;
  return { onTouchStart: trackTouch, onTouchMove: trackMovement, onTouchEnd: finishTouch };
}

function TabButton({ icon, activeIcon, label, badge, measured, isFocused, onPress, onPressIn, onPressOut, ref, ...props }: TabButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = isFocused ? colors.accent : colors.muted;
  const setPressed = use(TabPressFeedback);
  const webTouch = useWebTabTouch();
  return (
    <Pressable
      {...props}
      {...webTouch}
      // TabTrigger hands us its ref; the two libraries type it slightly differently.
      ref={ref as never}
      pressRetentionOffset={{ left: dragThreshold, right: dragThreshold, top: verticalTolerance, bottom: verticalTolerance }}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={badge ? `${label}, ${badge} overdue` : label}
      onPress={(event) => {
        if (Platform.OS !== "web" && !isFocused) void Haptics.selectionAsync();
        setPressed?.(false);
        onPress?.(event);
      }}
      onPressIn={(event) => {
        onPressIn?.(event);
        setPressed?.(true);
      }}
      onPressOut={(event) => {
        onPressOut?.(event);
        setPressed?.(false);
      }}
      style={[styles.tab, isFocused && !measured && styles.tabOn]}
    >
      <View style={styles.tabContent}>
        <View>
          <Icon name={isFocused && activeIcon ? activeIcon : icon} size={21} color={color} />
          {badge ? (
            <View style={styles.badge}><AppText style={styles.badgeText}>{badge > 9 ? "9+" : String(badge)}</AppText></View>
          ) : null}
        </View>
        <AppText style={[styles.label, { color }]} numberOfLines={1}>{label}</AppText>
      </View>
    </Pressable>
  );
}

const useStyles = createStyles((c) => ({
  root: { flex: 1 },
  bar: {
    position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 2, padding: 6,
    borderRadius: 32, backgroundColor: c.tabBar, borderWidth: 1, borderColor: c.line,
    boxShadow: `0px 8px 28px ${c.shadow}`,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 26 },
  tabContent: { width: "100%", alignItems: "center", gap: 3 },
  indicator: { position: "absolute", left: 0, borderRadius: 26, backgroundColor: c.tabActive },
  tabOn: { backgroundColor: c.tabActive },
  label: { fontFamily: font.semibold, fontSize: 10.5, lineHeight: 13 },
  badge: { position: "absolute", top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.bold, fontSize: 10, lineHeight: 12, color: "#FFFFFF" },
}));
