import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export async function storageGet(
  key: string,
  bridge: EvenAppBridge | null
): Promise<string | null> {
  if (bridge) {
    const v = await bridge.getLocalStorage(key);
    if (v) return v;
  }
  return localStorage.getItem(key);
}

export async function storageSet(
  key: string,
  value: string,
  bridge: EvenAppBridge | null
): Promise<void> {
  localStorage.setItem(key, value);
  if (bridge) await bridge.setLocalStorage(key, value);
}

export async function storageRemove(
  key: string,
  bridge: EvenAppBridge | null
): Promise<void> {
  localStorage.removeItem(key);
  if (bridge) await bridge.setLocalStorage(key, "");
}
