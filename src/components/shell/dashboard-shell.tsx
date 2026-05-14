import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(dashboard)/actions";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Button } from "@/components/ui/button";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";

export function DashboardShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:h-screen lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="no-print border-b border-border bg-sidebar lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
            <Link
              href="/inicio"
              className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/30 hover:bg-secondary/50"
            >
              <BrandLogo size="small" showText={false} imageClassName="size-9" />
              <span>
                <span className="block text-base font-bold">Mostrador</span>
                <span className="block text-xs text-muted-foreground">
                  Ferreteria Guemes
                </span>
              </span>
            </Link>
            <SidebarNav />
            <div className="mt-auto grid gap-3 rounded-lg border border-border bg-card p-3">
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
        <main className="flex min-h-screen min-w-0 flex-col lg:h-screen">
          <header className="no-print border-b border-border bg-card px-4 py-2 sm:px-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-lg font-bold text-primary">
                {ferreteriaGuemesBrand.brandName}
              </p>
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo size="small" showText={false} />
                <div className="hidden min-w-0 text-right sm:block">
                  <p className="text-sm text-muted-foreground">Usuario</p>
                  <p className="max-w-48 truncate text-base font-semibold">
                    {userEmail ?? "Sesion activa"}
                  </p>
                </div>
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
