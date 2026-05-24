"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navigationItems } from "./nav-items";

const shortcutItems = navigationItems;

export function ClassicShortcutsBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Accesos rapidos"
      className="no-print border-b border-border bg-secondary px-2 py-2 sm:px-2.5"
    >
      <div className="flex gap-2 overflow-x-auto pb-0.5 lg:flex-wrap lg:overflow-visible">
        {shortcutItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/stock" && pathname.startsWith("/stock"));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-13 min-w-[150px] shrink-0 items-center gap-2 rounded-md border px-3 text-base font-bold shadow-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary hover:bg-background"
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
