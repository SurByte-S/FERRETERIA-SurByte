import Link from "next/link";
import { WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-muted text-primary">
            <WifiOff className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>Sin conexion</CardTitle>
          <CardDescription>
            No hay internet. Podes volver a intentar cuando se restablezca la
            conexion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12 px-5 text-base">
            <Link href="/inicio">Reintentar</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
