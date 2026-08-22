"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type PrintPreviewFrameProps = {
  children: ReactNode;
  defaultZoom?: number;
};

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.2;
const ZOOM_STEP = 0.1;

function clampZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 0.85;
  }

  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

export function PrintPreviewFrame({
  children,
  defaultZoom = 0.85,
}: PrintPreviewFrameProps) {
  const [zoom, setZoom] = useState(() => clampZoom(defaultZoom));
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const previewStyle = {
    "--print-preview-zoom": zoom,
  } as CSSProperties;

  function changeZoom(delta: number) {
    setZoom((currentZoom) => clampZoom(Number((currentZoom + delta).toFixed(2))));
  }

  return (
    <section className="print-preview-frame relative overflow-auto rounded-md border border-border bg-muted/30 p-3 sm:p-5">
      <div className="no-print sticky top-3 z-10 mb-3 ml-auto flex w-fit items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm lg:absolute lg:right-4 lg:top-4 lg:flex-col">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => changeZoom(-ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="h-9 w-10 px-0 text-lg font-bold"
          aria-label="Alejar"
          title="Alejar"
        >
          -
        </Button>
        <span className="min-w-14 px-2 text-center text-sm font-bold tabular-nums text-foreground">
          {zoomLabel}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => changeZoom(ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="h-9 w-10 px-0 text-lg font-bold"
          aria-label="Acercar"
          title="Acercar"
        >
          +
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setZoom(1)}
          className="h-9 px-3 text-sm font-bold"
          aria-label="Tamaño normal"
          title="Tamaño normal"
        >
          100%
        </Button>
      </div>

      <div className="print-preview-stage flex min-w-max justify-center pb-6 lg:pr-16">
        <div className="print-preview-scaled" style={previewStyle}>
          {children}
        </div>
      </div>
    </section>
  );
}
