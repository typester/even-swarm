let debugEnabled = false;
let logHandler: ((msg: string) => void) | null = null;

export function setDebugLogEnabled(b: boolean) {
  debugEnabled = b;
}

export function setLogHandler(handler: ((msg: string) => void) | null) {
  logHandler = handler;
}

export function log(msg: string) {
  if (!debugEnabled) return;
  console.log(msg);
  logHandler?.(msg);
}
