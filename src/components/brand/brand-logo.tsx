"use client";

import { useState } from "react";

import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  brandName?: string;
  size?: "small" | "medium" | "large";
  showText?: boolean;
  className?: string;
  imageClassName?: string;
  logoUrl?: string | null;
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
  brandName,
  size = "medium",
  showText = true,
  className,
  imageClassName,
  logoUrl,
}: BrandLogoProps) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const classes = sizeClasses[size];
  const displayBrandName = brandName?.trim() || ferreteriaGuemesBrand.brandName;
  const imageSrc = logoUrl?.trim() || LOGO_SRC;
  const imageFailed = failedImageSrc === imageSrc;

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
          "brand-logo-mark flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-white shadow-sm",
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
            {getBrandInitials(displayBrandName)}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`Logo de ${displayBrandName}`}
            className="block h-full w-full object-contain p-0.5"
            loading="eager"
            decoding="async"
            onError={() => setFailedImageSrc(imageSrc)}
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
            {displayBrandName}
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

function getBrandInitials(value: string) {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "FG";
}
