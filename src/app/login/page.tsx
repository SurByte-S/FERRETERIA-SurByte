import { redirect } from "next/navigation";
import Link from "next/link";

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
            Mostrador de ventas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <nav
            aria-label="Enlaces legales"
            className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm font-medium text-muted-foreground"
          >
            <Link
              href="/terminos-y-condiciones"
              className="transition-colors hover:text-primary"
            >
              Términos y Condiciones
            </Link>
            <Link
              href="/politica-de-privacidad"
              className="transition-colors hover:text-primary"
            >
              Política de Privacidad
            </Link>
          </nav>
        </CardContent>
      </Card>
    </main>
  );
}

