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
        <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="size-7" aria-hidden="true" />
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-lg leading-8 text-muted-foreground">{text}</p>
        <Button asChild className="h-12 gap-2 px-5 text-base">
          <Link href={actionHref}>
            <Icon className="size-5" aria-hidden="true" />
            {actionLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
