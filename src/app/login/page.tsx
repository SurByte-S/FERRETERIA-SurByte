import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/inicio");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>Ingresar</CardTitle>
          <CardDescription>
            Usa tu email y contrasena para entrar al sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

