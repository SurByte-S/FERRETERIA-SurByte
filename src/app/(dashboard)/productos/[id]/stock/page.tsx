import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Package } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatStockQuantity } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type ProductStockPageProps = {
  params: Promise<{ id: string }>;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  stock_quantity: number;
  min_stock: number;
};

type MovementRow = {
  id: string;
  movement_type: "initial" | "purchase" | "sale" | "adjustment" | "return";
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function movementLabel(type: MovementRow["movement_type"]) {
  const labels: Record<MovementRow["movement_type"], string> = {
    initial: "Stock inicial",
    purchase: "Compra",
    sale: "Venta",
    adjustment: "Ajuste",
    return: "Devolucion",
  };

  return labels[type];
}

function stockStatus(product: ProductRow) {
  if (product.stock_quantity <= 0) {
    return "Sin stock";
  }

  if (product.stock_quantity <= product.min_stock) {
    return "Bajo stock";
  }

  return "Stock OK";
}

export default async function ProductStockPage({ params }: ProductStockPageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [productResult, movementsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id,sku,name,stock_quantity,min_stock")
      .eq("tenant_id", tenant.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("inventory_movements")
      .select("id,movement_type,quantity,unit_cost,notes,created_at")
      .eq("tenant_id", tenant.id)
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (productResult.error || !productResult.data) {
    notFound();
  }

  const product = productResult.data as unknown as ProductRow;
  const movements = (movementsResult.data ?? []) as unknown as MovementRow[];

  return (
    <>
      <PageHeader
        title={`Stock de ${product.name}`}
        description="Historial auditable de cambios de stock del producto."
        backHref="/productos"
        backLabel="Volver a productos"
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>Codigo de catalogo: {product.sku}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-base text-muted-foreground">Stock actual</p>
              <p className="text-3xl font-bold">
                {formatStockQuantity(product.stock_quantity)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-base text-muted-foreground">Stock minimo</p>
              <p className="text-3xl font-bold">
                {formatStockQuantity(product.min_stock)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-base text-muted-foreground">Estado</p>
              <p className="text-3xl font-bold">{stockStatus(product)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimientos de stock</CardTitle>
            <CardDescription>
              Cada ajuste o venta queda registrado con fecha y motivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {movements.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Todavia no hay movimientos de stock para este producto.
              </p>
            ) : (
              movements.map((movement) => (
                <div
                  key={movement.id}
                  className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(movement.created_at)}
                    </p>
                    <p className="text-xl font-bold">
                      {movementLabel(movement.movement_type)}
                    </p>
                    <p className="text-base">
                      Nota: {movement.notes ?? "Sin nota"}
                    </p>
                    <p className="text-base text-muted-foreground">
                      Costo unitario: {formatMoney(movement.unit_cost)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-2xl font-bold">
                    {movement.quantity < 0 ? (
                      <ArrowDown className="size-6 text-destructive" aria-hidden="true" />
                    ) : (
                      <ArrowUp className="size-6 text-emerald-700" aria-hidden="true" />
                    )}
                    {formatStockQuantity(movement.quantity)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
