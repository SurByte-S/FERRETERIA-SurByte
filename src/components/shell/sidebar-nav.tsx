"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigationItems } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegacion principal" className="grid gap-2">
      <div className="grid gap-1.5">
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
                "h-10 justify-start gap-2 px-2 text-sm",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary"
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.title}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
