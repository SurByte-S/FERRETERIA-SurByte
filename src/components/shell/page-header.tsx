import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  eyebrow = "Mostrador",
  backHref,
  backLabel = "Volver",
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-6 max-w-4xl">
      {backHref ? (
        <Button asChild variant="outline" className="mb-4 h-12 gap-2 px-5 text-base">
          <Link href={backHref}>
            <ArrowLeft className="size-5" aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      {eyebrow ? (
        <p className="mb-2 text-base font-medium text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-lg leading-8 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
