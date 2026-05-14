"use client";

import { useState } from "react";

import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "small" | "medium" | "large";
  showText?: boolean;
  className?: string;
  imageClassName?: string;
};

const LOGO_SRC = "/brand/ferreteria-guemes-logo.png";

const sizeClasses = {
  small: {
    wrapper: "gap-2",
    image: "size-10",
    title: "text-base",
    subtitle: "text-xs",
    fallback: "text-sm",
  },
  medium: {
    wrapper: "gap-3",
    image: "size-14",
    title: "text-lg",
    subtitle: "text-sm",
    fallback: "text-base",
  },
  large: {
    wrapper: "gap-4",
    image: "size-24",
    title: "text-2xl",
    subtitle: "text-base",
    fallback: "text-xl",
  },
};

export function BrandLogo({
  size = "medium",
  showText = true,
  className,
  imageClassName,
}: BrandLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const classes = sizeClasses[size];

  return (
    <div
      className={cn(
        "brand-logo flex min-w-0 items-center",
        classes.wrapper,
        className
      )}
    >
      <div
        className={cn(
          "brand-logo-mark flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white",
          classes.image,
          imageClassName
        )}
      >
        {imageFailed ? (
          <span
            className={cn(
              "font-black leading-none text-primary",
              classes.fallback
            )}
            aria-hidden="true"
          >
            FG
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOGO_SRC}
            alt={`Logo de ${ferreteriaGuemesBrand.brandName}`}
            className="block h-full w-full object-contain p-1"
            loading="eager"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      {showText ? (
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-bold leading-tight text-foreground",
              classes.title
            )}
          >
            {ferreteriaGuemesBrand.brandName}
          </span>
          <span
            className={cn(
              "block truncate font-medium leading-tight text-muted-foreground",
              classes.subtitle
            )}
          >
            {ferreteriaGuemesBrand.slogan}
          </span>
        </span>
      ) : null}
    </div>
  );
}
