import { AsyncLocalStorage } from "node:async_hooks";
type Scope = { signal: AbortSignal; requests: number; pending: Set<Promise<unknown>> };
const scope = new AsyncLocalStorage<Scope>();
export const inPretixScope = () => !!scope.getStore();
export async function boundedPretix<T>(fn: () => Promise<T>, milliseconds = 25000, requests = 100) {
  if (scope.getStore()) return fn();
  const abort = new AbortController();
  const state: Scope = { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(milliseconds)]), requests, pending: new Set() };
  return scope.run(state, async () => {
    try { return await fn(); }
    finally {
      abort.abort(); // Stop sibling reads before releasing a durable computation lease.
      await Promise.allSettled([...state.pending]);
    }
  });
}
export function trackPretix<T>(promise: Promise<T>) {
  const state = scope.getStore();
  if (state) {
    state.pending.add(promise);
    promise.then(()=>state.pending.delete(promise),()=>state.pending.delete(promise));
  }
  return promise;
}
export function pretixSignal(_url: URL, init: RequestInit) {
  const state = scope.getStore();
  if (!state) return init.signal;
  state.signal.throwIfAborted();
  if (--state.requests < 0) throw new Error("Pretix computation request ceiling");
  return init.signal ? AbortSignal.any([state.signal, init.signal]) : state.signal;
}
