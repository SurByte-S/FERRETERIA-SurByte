"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { attachOfflineSession, createBrowserOfflineSession, type SessionScope, type SessionStatus } from "@/lib/offline/offline-session";

const StatusContext = createContext<SessionStatus>("checking");
export function useOfflineSessionReady() {
  return useContext(StatusContext) === "ready";
}

export function OfflineSessionBoundary({ scope, children }: { scope: SessionScope; children: React.ReactNode }) {
  // Layout keys this boundary by the server identity and public session marker.
  const [session] = useState(() => createBrowserOfflineSession(scope));
  const status = useSyncExternalStore(session.subscribe, session.snapshot, () => "checking" as const);
  useEffect(() => {
    const detach = attachOfflineSession(session);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel("ferreteria-session-check"); } catch { /* Polling remains authoritative. */ }
    const check = () => { session.check(); };
    const refresh = () => { void session.verify(); };
    const wake = () => { check(); if (document.visibilityState === "visible") refresh(); };
    if (channel) channel.onmessage = () => { check(); refresh(); };
    // No user, tenant, token or pending data is transmitted.
    channel?.postMessage("check");
    let lastStatus = session.snapshot();
    const unsubscribe = session.subscribe(() => {
      const next = session.snapshot();
      if (next === "invalid" && lastStatus !== "invalid") channel?.postMessage("check");
      lastStatus = next;
    });
    const poll = window.setInterval(check, 1000);
    const revalidate = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    // Check before UI handlers too; background timers can be throttled.
    const beforeInteraction = (event: Event) => {
      if (session.snapshot() === "invalid") return; // Allow the recovery link.
      check();
      if (session.snapshot() === "invalid") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", check);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    document.addEventListener("click", beforeInteraction, true);
    document.addEventListener("submit", beforeInteraction, true);
    document.addEventListener("keydown", beforeInteraction, true);
    refresh();
    return () => {
      detach(); unsubscribe(); channel?.close();
      window.clearInterval(poll); window.clearInterval(revalidate);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", check);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("click", beforeInteraction, true);
      document.removeEventListener("submit", beforeInteraction, true);
      document.removeEventListener("keydown", beforeInteraction, true);
    };
  }, [session]);

  if (status === "invalid") {
    // Unmount the old POS and panels: discard only their in-memory state.
    // Use a full navigation, never refresh stale server props in-place.
    return <main className="p-6" role="alert">
      <p>La sesion cambio o vencio. Esta pantalla quedo bloqueada. Los presupuestos guardados en este equipo se conservan.</p>
      <a href="/inicio" onClick={() => { window.location.href = "/inicio"; }}>Abrir una pantalla nueva</a>
    </main>;
  }
  return <StatusContext.Provider value={status}>
    {status !== "ready" && <div className="no-print border-b bg-background p-3" role="status">
      <p>Presupuestos offline bloqueados hasta verificar la sesion con internet. Los registros locales se conservan.</p>
      <button type="button" onClick={() => void session.verify()}>Verificar sesion</button>
    </div>}
    {children}
  </StatusContext.Provider>;
}
