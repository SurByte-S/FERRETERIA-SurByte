import Link from "next/link";
import { Wrench } from "lucide-react";

import { SidebarNav } from "@/components/shell/sidebar-nav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="no-print border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4 sm:p-6">
            <Link
              href="/inicio"
              className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-background px-4 text-left"
            >
              <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="size-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-bold">Ferreteria</span>
                <span className="block text-sm text-muted-foreground">
                  Administracion simple
                </span>
              </span>
            </Link>
            <SidebarNav />
          </div>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
