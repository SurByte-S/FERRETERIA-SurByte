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
                "h-10 justify-center gap-2 px-2 text-sm transition-all duration-150",
                active
                  ? "border-l-4 border-l-accent bg-primary pl-1.5 font-bold text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary",
                "lg:group-hover:justify-start"
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="max-w-full overflow-hidden whitespace-nowrap transition-all duration-150 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[160px] lg:group-hover:opacity-100">
                  {item.title}
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
