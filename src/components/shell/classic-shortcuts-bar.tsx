"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { TenantRole } from "@/lib/tenant";
import { navigationItems } from "./nav-items";

function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/inicio") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClassicShortcutsBar({ tenantRole }: { tenantRole: TenantRole }) {
  const pathname = usePathname();
  const shortcutItems = navigationItems.filter(
    (item) =>
      !("allowedRoles" in item) ||
      (item.allowedRoles as readonly TenantRole[]).includes(tenantRole)
  );

  return (
    <nav
      aria-label="Accesos rapidos"
      className="no-print border-b border-[#9aa7b8] bg-[#e9edf3] px-2 py-2 sm:px-2.5"
    >
      <div className="grid grid-flow-col auto-cols-[minmax(180px,1fr)] gap-2 overflow-x-auto pb-0.5">
        {shortcutItems.map((item) => {
          const Icon = item.icon;
          const active = isNavigationItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 w-full min-w-[180px] shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-center text-base font-semibold whitespace-nowrap shadow-sm transition-colors",
                active
                  ? "border-primary/80 bg-primary/10 text-primary shadow-md ring-2 ring-primary/20"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50"
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
