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
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

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
    </nav>
  );
}
