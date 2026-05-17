"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigationItems } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegacion principal" className="grid gap-3">
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
                "h-11 justify-start gap-2 px-3 text-sm 2xl:h-14 2xl:gap-3 2xl:px-4 2xl:text-base",
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
    </nav>
  );
}
