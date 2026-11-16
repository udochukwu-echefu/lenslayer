import { onlineManager } from "@tanstack/react-query";
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from "expo-network";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

const hasConnection = (state: NetworkState) => state.isConnected !== false;
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const snapshot = () => onlineManager.isOnline();
const serverSnapshot = () => true;

/** Connect the device state to query reads; subscriptions drive the offline UI. */
export function monitorConnection() {
  if (Platform.OS === "web" && typeof window === "undefined") return;
  onlineManager.setEventListener((setOnline) => {
    let receivedUpdate = false;
    const listener = addNetworkStateListener((state) => {
      receivedUpdate = true;
      setOnline(hasConnection(state));
    });
    void getNetworkStateAsync().then((state) => {
      if (!receivedUpdate) setOnline(hasConnection(state));
    }).catch(() => {});
    return () => { receivedUpdate = true; listener.remove(); };
  });
}

export function useIsOnline() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export async function recheckConnection() {
  const state = await getNetworkStateAsync().catch(() => null);
  if (state) onlineManager.setOnline(hasConnection(state));
}
