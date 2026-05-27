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

type Reason = "config" | "tenant" | "multiple-tenants";

function getPageCopy(reason: Reason) {
  if (reason === "config") {
    return {
      title: "La configuracion del servidor esta incompleta",
      description:
        "Faltan variables de Supabase en produccion. Revisa los logs de Vercel y la configuracion del proyecto.",
    };
  }

  if (reason === "multiple-tenants") {
    return {
      title: "Tu usuario tiene mas de una ferreteria activa",
      description:
        "La app todavia no permite elegir entre varias ferreterias. Pedile al administrador que deje una sola asignacion activa.",
    };
  }

  return {
    title: "No tenes una ferreteria asignada",
    description:
      "Pedile al administrador que te agregue a una ferreteria antes de usar el sistema.",
  };
}

export default async function SinFerreteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason: rawReason } = await searchParams;
  const reason: Reason =
    rawReason === "config" || rawReason === "multiple-tenants"
      ? rawReason
      : "tenant";
  const copy = getPageCopy(reason);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-destructive/40">
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
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

