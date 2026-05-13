import Link from "next/link";
import { LogOut, Wrench } from "lucide-react";

import { logoutAction } from "@/app/(dashboard)/actions";
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
            <div className="mt-auto grid gap-3 rounded-lg border border-border bg-background p-4">
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
