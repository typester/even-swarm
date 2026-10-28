import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  utf8ByteLength,
  type EvenAppBridge,
  type EvenHubEvent,
} from "@evenrealities/even_hub_sdk";
import { log } from "../log";

export type GlassesPage =
  | { kind: "text"; text: string; menu?: boolean }
  | { kind: "list"; name: "venues" | "error"; items: string[]; menu?: boolean };

export interface GlassesHandlers {
  onVenueSelect?: (idx: number) => void;
  onRetry?: () => void;
  onReload?: () => void;
}

export interface Glasses {
  show: (page: GlassesPage) => Promise<void>;
  setHandlers: (handlers: GlassesHandlers) => void;
  scheduleAutoExit: (ms: number) => void;
}

const MENU_RELOAD = 1;

const MENU = new MenuContainerProperty({
  menuItems: [new MenuItemProperty({ itemName: "Reload venues", itemID: MENU_RELOAD })],
});

// The firmware can deliver one gesture twice, 50-100 ms apart.
const DUPLICATE_MS = 300;
const SYS_DUPLICATE_MS = 600;

// List limits: the simulator rejects an item over 63 UTF-8 bytes (the docs say 64 characters), and
// one over-long item makes the host reject the whole page, leaving the previous one on the glasses.
const MAX_ITEMS = 20;
const MAX_ITEM_BYTES = 63;
const ITEM_TAIL = " | ";
const ELLIPSIS = "...";

// Shortens the part before the last " | " so the tail (a distance, "Tap to retry") stays readable.
function fitItem(item: string): string {
  if (utf8ByteLength(item) <= MAX_ITEM_BYTES) return item;
  const cut = item.lastIndexOf(ITEM_TAIL);
  const keepTail = cut >= 0 && utf8ByteLength(ELLIPSIS + item.slice(cut)) <= MAX_ITEM_BYTES;
  const tail = keepTail ? item.slice(cut) : "";
  const head = Array.from(keepTail ? item.slice(0, cut) : item);
  while (head.length > 0 && utf8ByteLength(head.join("") + ELLIPSIS + tail) > MAX_ITEM_BYTES) {
    head.pop();
  }
  return head.join("") + ELLIPSIS + tail;
}

const STARTUP_TEXT = "Checkin\n\nLoading...";
const STARTUP_PAGE: GlassesPage = { kind: "text", text: STARTUP_TEXT };

function textContainer(text: string): TextContainerProperty {
  const tc = new TextContainerProperty();
  tc.containerID = 1;
  tc.containerName = "status";
  tc.xPosition = 0;
  tc.yPosition = 0;
  tc.width = 576;
  tc.height = 288;
  tc.content = text;
  tc.isEventCapture = 1;
  return tc;
}

function listContainer(name: string, items: string[]): ListContainerProperty {
  const fitted = items.slice(0, MAX_ITEMS).map(fitItem);
  const itemContainer = new ListItemContainerProperty();
  itemContainer.itemCount = fitted.length;
  itemContainer.itemWidth = 576;
  itemContainer.isItemSelectBorderEn = 1;
  itemContainer.itemName = fitted;

  const lc = new ListContainerProperty();
  lc.containerID = 1;
  lc.containerName = name;
  lc.xPosition = 0;
  lc.yPosition = 0;
  lc.width = 576;
  lc.height = 288;
  lc.isEventCapture = 1;
  lc.itemContainer = itemContainer;
  return lc;
}

function rebuildOf(page: GlassesPage): RebuildPageContainer {
  const p = new RebuildPageContainer();
  p.containerTotalNum = 1;
  if (page.kind === "text") p.textObject = [textContainer(page.text)];
  else p.listObject = [listContainer(page.name, page.items)];
  // A rebuild without menuObject clears the custom menu, so pages that keep it resend it.
  if (page.menu) p.menuObject = MENU;
  return p;
}

// The app owns the glasses for its whole life: the startup page is created once, as soon as the
// bridge exists, whatever screen the phone shows.
export function useGlasses(bridge: EvenAppBridge | null): Glasses {
  const readyRef = useRef<Promise<void> | null>(null);
  const pageRef = useRef<GlassesPage>(STARTUP_PAGE);
  const renderedRef = useRef<GlassesPage>(STARTUP_PAGE);
  const handlersRef = useRef<GlassesHandlers>({});
  const exitingRef = useRef(false);
  const autoExitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventAtRef = useRef(new Map<string, number>());

  const render = useCallback(
    async (page: GlassesPage) => {
      if (!bridge) return;
      if (page.kind === "list" && page.items.length === 0) return;
      try {
        await bridge.rebuildPageContainer(rebuildOf(page));
      } catch (err) {
        console.error("rebuildPageContainer failed:", err);
      }
    },
    [bridge]
  );

  // Pages asked for before the startup page exists are drawn once it does; only the latest counts.
  const renderLatest = useCallback(async () => {
    const page = pageRef.current;
    if (renderedRef.current === page) return;
    renderedRef.current = page;
    await render(page);
  }, [render]);

  useEffect(() => {
    if (!bridge || readyRef.current) return;

    const isDuplicate = (kind: string, windowMs: number) => {
      const now = Date.now();
      if (now - (lastEventAtRef.current.get(kind) ?? 0) < windowMs) return true;
      lastEventAtRef.current.set(kind, now);
      return false;
    };

    const onDoubleClick = () => {
      if (isDuplicate("double", DUPLICATE_MS)) return;
      if (autoExitRef.current) {
        clearTimeout(autoExitRef.current);
        autoExitRef.current = null;
      }
      exitingRef.current = true;
      log("[glasses] double tap → shutDownPageContainer(1)");
      void bridge.shutDownPageContainer(1);
    };

    const onEvent = (event: EvenHubEvent) => {
      log(`[event] raw=${JSON.stringify(event)}`);

      const itemId = event.menuItemClickEvent?.itemID;
      if (itemId !== undefined) {
        if (itemId === MENU_RELOAD) {
          log("[menu] Reload venues");
          handlersRef.current.onReload?.();
        }
        return;
      }

      if (event.listEvent) {
        const evt = event.listEvent;
        // The SDK turns CLICK_EVENT (0) into undefined, and an index of 0 likewise.
        const type = evt.eventType ?? OsEventTypeList.CLICK_EVENT;
        if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) return onDoubleClick();
        if (type !== OsEventTypeList.CLICK_EVENT || isDuplicate("click", DUPLICATE_MS)) return;
        const idx = evt.currentSelectItemIndex ?? 0;
        if (evt.containerName === "error") handlersRef.current.onRetry?.();
        else if (evt.containerName === "venues") handlersRef.current.onVenueSelect?.(idx);
        return;
      }

      if (event.textEvent) {
        if (event.textEvent.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) onDoubleClick();
        return;
      }

      // FOREGROUND_ENTER arrives when a system layer (the exit dialog, the menu) opens over the
      // app, not when the app comes back, so it is deliberately ignored.
      switch (event.sysEvent?.eventType) {
        case OsEventTypeList.DOUBLE_CLICK_EVENT:
          onDoubleClick();
          break;
        case OsEventTypeList.FOREGROUND_EXIT_EVENT:
          if (isDuplicate("foregroundExit", SYS_DUPLICATE_MS) || !exitingRef.current) break;
          // During the exit dialog this means "No": the host has cleared the page by then.
          exitingRef.current = false;
          void render(pageRef.current);
          break;
      }
    };

    readyRef.current = (async () => {
      const start = new CreateStartUpPageContainer();
      start.containerTotalNum = 1;
      start.textObject = [textContainer(STARTUP_TEXT)];
      const result = await bridge.createStartUpPageContainer(start);
      if (result !== StartUpPageCreateResult.success) {
        log(`[glasses] createStartUpPageContainer → ${result}`);
      }
      bridge.onEvenHubEvent(onEvent);
    })().catch((err) => console.error("glasses setup failed:", err));

    void readyRef.current.then(renderLatest);
  }, [bridge, render, renderLatest]);

  const show = useCallback(
    async (page: GlassesPage) => {
      pageRef.current = page;
      const ready = readyRef.current;
      if (!ready) return;
      await ready;
      await renderLatest();
    },
    [renderLatest]
  );

  const setHandlers = useCallback((handlers: GlassesHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const scheduleAutoExit = useCallback(
    (ms: number) => {
      if (autoExitRef.current) clearTimeout(autoExitRef.current);
      autoExitRef.current = setTimeout(() => {
        autoExitRef.current = null;
        log("[glasses] auto exit → shutDownPageContainer(0)");
        void bridge?.shutDownPageContainer(0);
      }, ms);
    },
    [bridge]
  );

  return useMemo(
    () => ({ show, setHandlers, scheduleAutoExit }),
    [show, setHandlers, scheduleAutoExit]
  );
}
