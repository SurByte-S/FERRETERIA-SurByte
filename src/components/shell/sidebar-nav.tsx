"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigationItems } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegacion principal" className="grid gap-1">
      <div className="grid gap-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/stock" && pathname.startsWith("/stock"));

          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "default" : "ghost"}
              className={cn(
                "h-9 justify-center gap-1.5 px-1.5 text-sm transition-all duration-150",
                active
                  ? "border-l-2 border-l-accent bg-primary pl-1 font-bold text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary",
                "lg:group-hover:justify-start"
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="max-w-full overflow-hidden whitespace-nowrap transition-all duration-150 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[175px] lg:group-hover:opacity-100">
                  <span className="block truncate leading-tight">
                    {item.title}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-xs font-medium leading-tight",
                      active ? "text-primary-foreground" : "text-muted-foreground"
                    )}
                  >
                   
                  </span>
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
