import Link from "next/link";
import { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  text,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="mb-1.5 flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-base leading-6 text-muted-foreground">{text}</p>
        <Button asChild className="h-9 gap-1.5 px-3 text-sm">
          <Link href={actionHref}>
            <Icon className="size-4" aria-hidden="true" />
            {actionLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
