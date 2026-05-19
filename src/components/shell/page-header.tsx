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
    <header className="mb-4 max-w-4xl">
      {backHref ? (
        <Button asChild variant="outline" className="mb-3 h-9 gap-1.5 px-3 text-sm">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      {eyebrow ? (
        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-2xl font-bold leading-tight tracking-normal sm:text-3xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-base leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
