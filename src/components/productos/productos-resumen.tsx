import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const demoRows = [
  { name: "Tornillos", detail: "Preparado para codigos y medidas" },
  { name: "Pinturas", detail: "Preparado para colores y presentaciones" },
  { name: "Herramientas", detail: "Preparado para marcas y precios" },
];

export function ProductosResumen() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rubros principales</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {demoRows.map((row) => (
            <div
              key={row.name}
              className="rounded-lg border border-border bg-background p-4"
            >
              <p className="text-lg font-semibold">{row.name}</p>
              <p className="mt-1 text-base text-muted-foreground">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
