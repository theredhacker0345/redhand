/**
 * Transport abstraction for the CDP WebSocket connection.
 * The real adapter wraps the `ws` package; tests inject a fake socket and
 * drive it with fixture JSON — the client logic never knows the difference.
 */

export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (err: Error) => void): void;
}

/** Adapter wrapping a `ws` WebSocket instance into the SocketLike shape. */
export function adaptWsSocket(socket: {
  send: (data: string) => void;
  close: (code?: number) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}): SocketLike {
  const socketLike: SocketLike = {
    send: (data) => socket.send(data),
    close: (code) => socket.close(code),
    onMessage: (handler) =>
      socket.on("message", (data: unknown) => {
        handler(String(data));
      }),
    onClose: (handler) => socket.on("close", () => handler()),
    onError: (handler) => socket.on("error", (err: unknown) => handler(err instanceof Error ? err : new Error(String(err)))),
  };
  return socketLike;
}
