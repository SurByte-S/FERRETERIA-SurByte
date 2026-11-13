import { readSessionMarker } from "../auth/session-marker";

export type SessionScope = { userId: string; tenantId: string; role: string; marker: string | null };
export type SessionStatus = "checking" | "ready" | "blocked" | "invalid";
type VerifiedScope = SessionScope & { validUntil: number };
export class SessionRejected extends Error {}
export class SessionNetworkError extends Error {}
export class SessionServerError extends Error {}
type Environment = {
  marker: () => string | null;
  online: () => boolean;
  now: () => number;
  verify: () => Promise<VerifiedScope>;
};

export class OfflineSession {
  private status: SessionStatus = "checking";
  private validUntil = 0;
  private generation = 0;
  private pending = false;
  private listeners = new Set<() => void>();
  constructor(readonly scope: SessionScope, private env: Environment) {}
  snapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private set(status: SessionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }
  invalidate = () => {
    if (this.status === "invalid") return;
    this.generation++;
    this.set("invalid");
  };
  private block() {
    if (this.status === "invalid" || this.status === "blocked") return;
    this.generation++;
    this.set("blocked");
  }
  check = () => {
    if (this.env.marker() !== this.scope.marker) this.invalidate();
    if (this.status === "ready" && this.env.now() >= this.validUntil) {
      this.block();
    }
    return this.status === "ready";
  };
  async verify() {
    this.check();
    if (this.status === "invalid" || this.pending) return;
    if (!this.env.online()) return;
    this.pending = true;
    // Routine checks must not revoke in-flight reads or unmount open panels.
    // Only loss of access increments generation. pending serializes requests.
    if (this.status !== "ready") this.set("checking");
    try {
      const result = await this.env.verify();
      this.check();
      if (this.snapshot() === "invalid") return;
      if (this.env.marker() !== this.scope.marker ||
          result.marker !== this.scope.marker || result.userId !== this.scope.userId ||
          result.tenantId !== this.scope.tenantId || result.role !== this.scope.role) {
        this.invalidate();
        return;
      }
      if (!Number.isFinite(result.validUntil) || result.validUntil <= this.env.now()) {
        throw new Error("Session expired");
      }
      this.validUntil = Math.min(result.validUntil, this.env.now() + 5 * 60_000);
      this.set("ready");
    } catch (error) {
      this.check();
      if (this.snapshot() === "invalid") return;
      if (error instanceof SessionRejected) this.invalidate();
      // Never restore a previously blocked lease, nor extend its deadline.
      else if (!(error instanceof SessionNetworkError && this.status === "ready")) this.block();
    } finally {
      this.pending = false;
    }
  }
  capture(tenantId: string, userId: string) {
    const generation = this.generation;
    const check = () => {
      if (!this.check() || generation !== this.generation ||
          tenantId !== this.scope.tenantId || userId !== this.scope.userId ||
          !["owner", "admin", "seller"].includes(this.scope.role)) {
        throw new Error("Acceso offline bloqueado. Verifica la sesion con internet antes de continuar.");
      }
    };
    check();
    return check;
  }
}

let activeSession: OfflineSession | null = null;
export function attachOfflineSession(session: OfflineSession) {
  activeSession = session;
  return () => { if (activeSession === session) activeSession = null; };
}

export function captureOfflineSession(tenantId: string, userId: string) {
  const session = activeSession;
  if (!session) throw new Error("Primero verifica la sesion con internet.");
  const check = session.capture(tenantId, userId);
  return {
    check: () => {
      if (activeSession !== session) throw new Error("La sesion cambio.");
      check();
    },
    subscribe: session.subscribe,
  };
}

export function createBrowserOfflineSession(scope: SessionScope) {
  return new OfflineSession(scope, {
    marker: () => readSessionMarker(document.cookie),
    online: () => typeof navigator === "undefined" || navigator.onLine,
    now: Date.now,
    verify: async () => {
      const options: RequestInit = {
        cache: "no-store", credentials: "same-origin", redirect: "error",
        signal: AbortSignal.timeout(10_000),
      };
      let response: Response;
      try {
        response = await fetch("/api/auth/session-context", options);
      } catch (error) {
        // Fetch TypeError alone can also mean CORS/configuration. Only allow
        // fallback when the browser confirms disconnection. Setup/JSON errors,
        // online timeouts and ambiguous failures remain conservative blocks.
        const transportFailure = error instanceof TypeError ||
          (error instanceof DOMException && ["NetworkError", "TimeoutError"].includes(error.name));
        if (navigator.onLine === false && transportFailure) throw new SessionNetworkError();
        throw error;
      }
      if (response.status === 401 || response.status === 403) throw new SessionRejected();
      if (response.status >= 500) throw new SessionServerError();
      if (!response.ok) throw new Error("Session verification failed");
      return response.json();
    },
  });
}
