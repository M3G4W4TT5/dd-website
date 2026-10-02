import { AsyncLocalStorage } from "node:async_hooks";
const scope = new AsyncLocalStorage<{ signal: AbortSignal; requests: number; seen: Set<string> }>();
export function boundedPretix<T>(fn: () => Promise<T>, milliseconds = 25000, requests = 100) {
  if (scope.getStore()) return fn();
  return scope.run({ signal: AbortSignal.timeout(milliseconds), requests, seen: new Set() }, fn);
}
export function pretixSignal(url: URL, init: RequestInit) {
  const state = scope.getStore();
  if (!state) return init.signal;
  state.signal.throwIfAborted();
  if (--state.requests < 0) throw new Error("Pretix computation request ceiling");
  // Repeated URLs are valid across separate checks; pagination cycle detection belongs to its iterator.
  return init.signal ? AbortSignal.any([state.signal, init.signal]) : state.signal;
}
