"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    function updateStatus() {
      setIsOffline(!navigator.onLine);
    }

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (!isOffline) {
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
