import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  "Buscar productos",
  "Agregar cantidades",
  "Revisar total",
  "Entregar presupuesto",
];

export function PresupuestoSimple() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo de trabajo</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-lg"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
