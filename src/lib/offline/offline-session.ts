import { readSessionMarker } from "../auth/session-marker";

export type SessionScope = { userId: string; tenantId: string; role: string; marker: string | null };
export type SessionStatus = "checking" | "ready" | "blocked" | "invalid";
type VerifiedScope = SessionScope & { validUntil: number };
export class SessionRejected extends Error {}
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
  private lastOnline: boolean;
  private listeners = new Set<() => void>();
  constructor(readonly scope: SessionScope, private env: Environment) {
    this.lastOnline = env.online();
  }
  snapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private set(status: SessionStatus) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }
  invalidate = () => {
    if (this.status === "invalid") return;
    this.generation++;
    this.set("invalid");
  };
  check = () => {
    if (this.env.marker() !== this.scope.marker) this.invalidate();
    const online = this.env.online();
    const reconnected = online && !this.lastOnline;
    this.lastOnline = online;
    if (reconnected && this.status !== "invalid") {
      this.generation++;
      this.set("blocked");
    }
    if (this.status === "ready" && this.env.now() >= this.validUntil) {
      this.generation++;
      this.set("blocked");
    }
    return this.status === "ready";
  };
  async verify() {
    this.check();
    if (this.status === "invalid" || this.pending) return;
    if (!this.env.online()) return;
    this.pending = true;
    const generation = ++this.generation;
    this.set("checking");
    try {
      const result = await this.env.verify();
      if (generation !== this.generation) return;
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
      if (generation === this.generation) {
        if (error instanceof SessionRejected) this.invalidate();
        else this.set("blocked");
      }
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
      const response = await fetch("/api/auth/session-context", {
        cache: "no-store", credentials: "same-origin", redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) throw new SessionRejected();
      if (!response.ok) throw new Error("Session verification failed");
      return response.json();
    },
  });
}
