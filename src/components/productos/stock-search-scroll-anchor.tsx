"use client";

import { useEffect, useRef } from "react";

export function StockSearchScrollAnchor({ enabled }: { enabled: boolean }) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const scrollTimeout = window.setTimeout(() => {
      anchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(scrollTimeout);
  }, [enabled]);

  return <div ref={anchorRef} aria-hidden="true" />;
}
