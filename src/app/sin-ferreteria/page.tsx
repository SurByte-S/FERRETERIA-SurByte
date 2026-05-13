import { AlertTriangle, LogOut } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutWithoutTenantAction } from "./actions";

export default function SinFerreteriaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-destructive/40">
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>No tenes una ferreteria asignada</CardTitle>
          <CardDescription>
            Pedile al administrador que te agregue a una ferreteria antes de usar
            el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutWithoutTenantAction}>
            <Button type="submit" className="h-14 gap-2 px-6 text-lg">
              <LogOut className="size-6" aria-hidden="true" />
              Cerrar sesion
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

