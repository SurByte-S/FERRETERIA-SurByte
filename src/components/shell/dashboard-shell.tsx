import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(dashboard)/actions";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/shell/sidebar-nav";

export function DashboardShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="no-print border-b border-border bg-sidebar lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4 sm:p-6">
            <Link
              href="/inicio"
              className="flex min-h-20 items-center rounded-lg border border-border bg-card px-4 text-left transition-colors hover:border-primary/30 hover:bg-secondary/50"
            >
              <BrandLogo size="medium" />
            </Link>
            <SidebarNav />
            <div className="mt-auto grid gap-3 rounded-lg border border-border bg-card p-4">
              <div>
                <p className="text-sm text-muted-foreground">Usuario</p>
                <p className="break-all text-base font-semibold">
                  {userEmail ?? "Sesion activa"}
                </p>
              </div>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-12 w-full gap-2 text-base"
                >
                  <LogOut className="size-5" aria-hidden="true" />
                  Cerrar sesion
                </Button>
              </form>
            </div>
          </div>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
