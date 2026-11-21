export { CdpClient, type CdpClientOptions, type CdpSendOptions, type EventBinding } from "./cdp-client.js";
export { adaptWsSocket, type SocketLike } from "./socket.js";
export { RedhandError, assertOk, type RedhandErrorCode, type RedhandErrorShape } from "./errors.js";
export {
  browserVersionSchema,
  targetInfoSchema,
  targetListSchema,
  elementSchema,
  snapshotSchema,
  rectSchema,
  evaluateResultSchema,
  type BrowserVersion,
  type TargetInfo,
  type RedhandElement,
  type Rect,
  type Snapshot,
  type EvaluateResult,
} from "./schema.js";
export {
  installExecutor,
  snapshot,
  liveRect,
  focusElement,
  scrollIntoView,
  selectOption,
  diffSnapshots,
  renderSnapshot,
  executorVersion,
  type SnapshotDiff,
} from "./index-layer.js";
