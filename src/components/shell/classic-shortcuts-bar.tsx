"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navigationItems, secondaryNavigationItems } from "./nav-items";

const shortcutItems = [
  navigationItems[0],
  navigationItems[1],
  navigationItems[2],
  navigationItems[3],
  navigationItems[4],
  navigationItems[5],
  secondaryNavigationItems[0],
] as const;

export function ClassicShortcutsBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Accesos rapidos"
      className="no-print border-b border-[#9aa7b8] bg-[#e9edf3] px-2 py-2 sm:px-2.5"
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
                  ? "border-[#174ea6] bg-[#1f5fbf] text-white"
                  : "border-[#8a96a8] bg-[#f8fafc] text-[#111827] hover:border-[#1f5fbf] hover:bg-white"
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
