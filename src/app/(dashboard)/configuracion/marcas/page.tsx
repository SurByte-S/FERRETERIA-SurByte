import Link from "next/link";
import { Search } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import { BrandsPanel, type BrandConfigItem } from "../configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase";

type MarcasPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type BrandRow = {
  id: string;
  name: string;
  active: boolean | null;
};

type ProductBrandRow = {
  brand_id: string | null;
};

export default async function ConfiguracionMarcasPage({
  searchParams,
}: MarcasPageProps) {
  const params = await searchParams;
  const q = cleanSearch(params.q);
  const tenant = await requireConfigurationTenant("/configuracion/marcas");
  const brands = await loadBrands({ q, tenantId: tenant.id });

  return (
    <>
      <PageHeader
        title="Marcas"
        description="Crear, buscar, editar y activar o desactivar marcas."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-5xl gap-4 pb-6">
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 md:flex-row md:items-end md:justify-between">
          <form
            action="/configuracion/marcas"
            className="grid flex-1 gap-2 md:grid-cols-[1fr_auto] md:items-end"
          >
            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar marca</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Nombre de marca"
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </label>
            <Button type="submit" className="h-12 gap-2 px-5 text-base">
              <Search className="size-5" aria-hidden="true" />
              Buscar
            </Button>
          </form>
          <Button asChild variant="outline" className="h-12 px-4 text-base">
            <Link href="/configuracion">Volver a Configuracion</Link>
          </Button>
        </div>

        {q ? (
          <p className="rounded-md border border-primary/30 bg-card p-3 text-sm font-semibold">
            Resultados para: {q}
          </p>
        ) : null}

        <BrandsPanel brands={brands} />
      </div>
    </>
  );
}

function cleanSearch(value: string | undefined) {
  return String(value ?? "").trim().replace(/[%_,()]/g, "");
}

async function loadBrands({
  q,
  tenantId,
}: {
  q: string;
  tenantId: string;
}): Promise<BrandConfigItem[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("brands")
    .select("id,name,active")
    .eq("tenant_id", tenantId)
    .order("active", { ascending: false })
    .order("name");

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudieron cargar las marcas.");
  }

  const rows = (data ?? []) as BrandRow[];
  const brandIds = rows.map((brand) => brand.id);
  const brandCounts = new Map<string, number>();

  if (brandIds.length > 0) {
    const productBrandsResult = await supabase
      .from("products")
      .select("brand_id")
      .eq("tenant_id", tenantId)
      .in("brand_id", brandIds);

    if (productBrandsResult.error) {
      throw new Error("No se pudo calcular el uso de las marcas.");
    }

    for (const row of (productBrandsResult.data ?? []) as ProductBrandRow[]) {
      if (row.brand_id) {
        brandCounts.set(row.brand_id, (brandCounts.get(row.brand_id) ?? 0) + 1);
      }
    }
  }

  return rows.map((brand) => ({
    id: brand.id,
    name: brand.name,
    active: brand.active !== false,
    productsCount: brandCounts.get(brand.id) ?? 0,
  }));
}
