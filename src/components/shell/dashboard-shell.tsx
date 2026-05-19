import Link from "next/link";
import { LogOut, Settings } from "lucide-react";

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
      <div className="grid min-h-screen lg:h-screen lg:grid-cols-[auto_minmax(0,1fr)] 2xl:grid-cols-[auto_minmax(0,1fr)]">
        <aside className="group no-print border-b border-sidebar-border bg-sidebar lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r lg:w-16 lg:transition-all lg:duration-200 lg:ease-out hover:lg:w-[220px]">
          <div className="flex min-h-full flex-col gap-1.5 p-1.5">
            <Link
              href="/inicio"
              className="flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-primary/15 bg-card px-2 text-left transition-all duration-150 hover:border-primary/30 hover:bg-secondary/60 lg:justify-start"
            >
              <BrandLogo
                size="small"
                showText={false}
                imageClassName="size-8"
              />
              <span className="min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[160px] lg:group-hover:opacity-100">
                <span className="block truncate text-base font-bold">
                  Mostrador
                </span>
                <span className="block text-xs text-muted-foreground">
                  Ferreteria Guemes
                </span>
              </span>
            </Link>
            <SidebarNav />
            <div className="mt-auto grid gap-1.5">
              <Button
                asChild
                variant="ghost"
                className="h-9 justify-center gap-2 px-2 text-sm text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-primary lg:group-hover:justify-start"
              >
                <Link href="/ajustes">
                  <Settings className="size-5 shrink-0" aria-hidden="true" />
                  <span className="max-w-full overflow-hidden whitespace-nowrap transition-all duration-150 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[140px] lg:group-hover:opacity-100">
                    Ajustes
                  </span>
                </Link>
              </Button>

              <div className="grid gap-1.5 rounded-lg border border-primary/15 bg-card p-1.5 overflow-hidden">
                <div className="min-w-0 overflow-hidden">
                  <p className="text-sm text-muted-foreground transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100">
                    Usuario
                  </p>
                  <p
                    className="truncate text-sm font-semibold transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100"
                    title={userEmail ?? "Sesion activa"}
                  >
                    {userEmail ?? "Sesion activa"}
                  </p>
                </div>
                <form action={logoutAction}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-8 w-full justify-center gap-2 px-2 text-sm transition-all duration-150 lg:justify-start"
                  >
                    <LogOut className="size-5" aria-hidden="true" />
                    <span className="max-w-full overflow-hidden whitespace-nowrap transition-all duration-150 lg:max-w-0 lg:opacity-0 lg:ml-2 lg:group-hover:max-w-[120px] lg:group-hover:opacity-100">
                      Cerrar sesion
                    </span>
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex min-h-screen min-w-0 flex-col lg:h-screen">
          <header className="no-print border-b border-sidebar-border bg-card px-2.5 py-1.5 sm:px-3">
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
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5 sm:p-2">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
