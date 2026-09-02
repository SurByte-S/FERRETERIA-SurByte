"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/components/pwa/use-online-status";

export function OfflineStatusBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="no-print border-b border-border bg-secondary px-3 py-2 text-secondary-foreground">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2 text-sm font-bold">
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        <span>Sin conexion. Algunas funciones no estaran disponibles.</span>
      </div>
    </div>
  );
}
