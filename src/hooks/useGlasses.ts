import { useEffect, useRef, useCallback } from "react";
import {
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  type EvenAppBridge,
  OsEventTypeList,
} from "@evenrealities/even_hub_sdk";
import { log } from "../log";

interface UseGlassesOptions {
  bridge: EvenAppBridge | null;
  onVenueListClick: (idx: number) => void;
  onErrorRetry: () => void;
  onForegroundEnter: () => void;
}

export function useGlasses({
  bridge,
  onVenueListClick,
  onErrorRetry,
  onForegroundEnter,
}: UseGlassesOptions) {
  // Refs to always invoke latest callbacks without stale closures
  const onVenueListClickRef = useRef(onVenueListClick);
  const onErrorRetryRef = useRef(onErrorRetry);
  const onForegroundEnterRef = useRef(onForegroundEnter);
  onVenueListClickRef.current = onVenueListClick;
  onErrorRetryRef.current = onErrorRetry;
  onForegroundEnterRef.current = onForegroundEnter;

  const checkinReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const setupDoneRef = useRef(false);

  useEffect(() => {
    if (!bridge || setupDoneRef.current) return;
    setupDoneRef.current = true;

    async function setup() {
      const tc = new TextContainerProperty();
      tc.containerID = 1;
      tc.containerName = "status";
      tc.xPosition = 0;
      tc.yPosition = 0;
      tc.width = 576;
      tc.height = 288;
      tc.content = "Loading...";

      const startPage = new CreateStartUpPageContainer();
      startPage.containerTotalNum = 1;
      startPage.textObject = [tc];

      await bridge!.createStartUpPageContainer(startPage);

      bridge!.onEvenHubEvent((event) => {
        log(`[event] raw=${JSON.stringify(event)}`);

        if (event.listEvent) {
          const evt = event.listEvent;
          log(
            `[listEvent] container=${evt.containerName} eventType=${evt.eventType} idx=${evt.currentSelectItemIndex}`
          );

          const isClick =
            evt.eventType === OsEventTypeList.CLICK_EVENT ||
            evt.eventType === undefined;

          if (isClick) {
            // Protobuf omits zero-valued numeric fields, so index 0 arrives as undefined
            const idx = evt.currentSelectItemIndex ?? 0;
            if (evt.containerName === "error") {
              log("[listEvent] error retry → loadVenues()");
              onErrorRetryRef.current();
            } else if (evt.containerName === "venues") {
              log(`[listEvent] venue selected idx=${idx} → doCheckin()`);
              onVenueListClickRef.current(idx);
            }
          }
        }

        if (event.sysEvent) {
          const sys = event.sysEvent;
          log(`[sysEvent] eventType=${sys.eventType}`);
          if (sys.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
            log("[sysEvent] DOUBLE_CLICK → shutDownPageContainer(1)");
            if (checkinReloadTimeoutRef.current) {
              clearTimeout(checkinReloadTimeoutRef.current);
              checkinReloadTimeoutRef.current = null;
            }
            bridge!.shutDownPageContainer(1);
          } else if (sys.eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
            log("[sysEvent] FOREGROUND_ENTER → loadVenues()");
            onForegroundEnterRef.current();
          }
        }
      });
    }

    setup().catch(console.error);
  }, [bridge]);

  const showText = useCallback(
    async (text: string) => {
      if (!bridge) return;
      const tc = new TextContainerProperty();
      tc.containerID = 1;
      tc.containerName = "status";
      tc.xPosition = 0;
      tc.yPosition = 0;
      tc.width = 576;
      tc.height = 288;
      tc.content = text;

      const page = new RebuildPageContainer();
      page.containerTotalNum = 1;
      page.textObject = [tc];
      await bridge.rebuildPageContainer(page);
    },
    [bridge]
  );

  const showList = useCallback(
    async (items: string[], containerName: "venues" | "error") => {
      if (!bridge || items.length === 0) return;
      try {
        const itemContainer = new ListItemContainerProperty();
        itemContainer.itemCount = items.length;
        itemContainer.itemWidth = 576;
        itemContainer.isItemSelectBorderEn = 1;
        itemContainer.itemName = items;

        const lc = new ListContainerProperty();
        lc.containerID = 1;
        lc.containerName = containerName;
        lc.xPosition = 0;
        lc.yPosition = 0;
        lc.width = 576;
        lc.height = 288;
        lc.isEventCapture = 1;
        lc.itemContainer = itemContainer;

        const page = new RebuildPageContainer();
        page.containerTotalNum = 1;
        page.listObject = [lc];
        await bridge.rebuildPageContainer(page);
      } catch (err) {
        console.error("showList error:", err);
        await showText(`List error:\n${String(err)}`);
      }
    },
    [bridge, showText]
  );

  const shutdown = useCallback(
    (level: number) => {
      bridge?.shutDownPageContainer(level);
    },
    [bridge]
  );

  const scheduleCheckinCleanup = useCallback(
    (onShutdown: () => void) => {
      log("[doCheckin] scheduling shutdown(0) + reload at +2000ms");
      const t = setTimeout(() => {
        log("[timer] shutDownPageContainer(0)");
        bridge?.shutDownPageContainer(0);
        onShutdown();
      }, 2000);
      checkinReloadTimeoutRef.current = t;
    },
    [bridge]
  );

  return { showText, showList, shutdown, scheduleCheckinCleanup };
}
