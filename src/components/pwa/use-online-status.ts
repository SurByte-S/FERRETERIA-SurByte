"use client";

import { useEffect, useState } from "react";

export const OFFLINE_ACTION_MESSAGE =
  "Sin conexion. Volve a intentar cuando vuelva internet.";

export function isBrowserOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    function updateStatus() {
      setIsOnline(navigator.onLine);
    }

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return isOnline;
}
