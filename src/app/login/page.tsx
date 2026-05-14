import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/inicio");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden border-border bg-card">
        <div className="h-1.5 bg-accent" />
        <CardHeader className="items-center text-center">
          <BrandLogo size="large" showText={false} />
          <CardTitle className="mt-2 text-2xl">
            Ingresar a {ferreteriaGuemesBrand.brandName}
          </CardTitle>
          <CardDescription>
            Sistema de gestion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

