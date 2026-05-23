import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AjustesPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="No hay opciones visibles por ahora."
        backHref="/inicio"
        backLabel="Volver a vender"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Ajustes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-semibold text-muted-foreground">
            No hay opciones visibles por ahora.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
