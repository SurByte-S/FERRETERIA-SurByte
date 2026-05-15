"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigationItems, secondaryNavigationItems } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegacion principal" className="grid gap-4">
      <div className="grid gap-2">
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
                "h-14 justify-start gap-3 px-4 text-base",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary"
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-5" aria-hidden="true" />
                <span>{item.title}</span>
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 border-t border-border pt-3 opacity-80">
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Encargado
        </p>
        {secondaryNavigationItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              className={cn(
                "h-11 justify-start gap-3 px-3 text-sm",
                active
                  ? "font-semibold text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary"
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-4" aria-hidden="true" />
                <span>{item.title}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
