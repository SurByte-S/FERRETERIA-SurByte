import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(dashboard)/actions";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ClassicShortcutsBar } from "@/components/shell/classic-shortcuts-bar";
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
      <div className="grid min-h-screen">
        <main className="flex min-h-screen min-w-0 flex-col lg:h-screen">
          <header className="no-print border-b border-sidebar-border bg-card px-2 py-1 sm:px-2.5">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/inicio"
                className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-secondary"
              >
                <BrandLogo size="small" showText={false} />
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold text-primary">
                    {ferreteriaGuemesBrand.brandName}
                  </span>
                  <span className="hidden text-xs font-semibold text-muted-foreground sm:block">
                    Mostrador
                  </span>
                </span>
              </Link>

              <div className="flex min-w-0 items-center gap-2">
                <div className="hidden min-w-0 text-right sm:block">
                  <p className="text-xs text-muted-foreground">Usuario</p>
                  <p
                    className="max-w-44 truncate text-sm font-semibold"
                    title={userEmail ?? "Sesion activa"}
                  >
                    {userEmail ?? "Sesion activa"}
                  </p>
                </div>
                <form action={logoutAction} className="no-print">
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-9 gap-1.5 px-3 text-sm"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Cerrar sesion</span>
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <ClassicShortcutsBar />

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1 sm:p-1.5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
