import Link from "next/link";
import { Search } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import {
  CategoriesPanel,
  type CategoryConfigItem,
} from "../configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase";

type CategoriasPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type CategoryRow = {
  id: string;
  name: string;
  active: boolean | null;
};

type ProductCategoryRow = {
  category_id: string | null;
};

export default async function ConfiguracionCategoriasPage({
  searchParams,
}: CategoriasPageProps) {
  const params = await searchParams;
  const q = cleanSearch(params.q);
  const tenant = await requireConfigurationTenant("/configuracion/categorias");
  const categories = await loadCategories({ q, tenantId: tenant.id });

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organiza los productos por rubro."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-5xl gap-4 pb-6">
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 md:flex-row md:items-end md:justify-between">
          <form
            action="/configuracion/categorias"
            className="grid flex-1 gap-2 md:grid-cols-[1fr_auto] md:items-end"
          >
            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar categoria</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Nombre de categoria"
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

        <CategoriesPanel categories={categories} />
      </div>
    </>
  );
}

function cleanSearch(value: string | undefined) {
  return String(value ?? "").trim().replace(/[%_,()]/g, "");
}

async function loadCategories({
  q,
  tenantId,
}: {
  q: string;
  tenantId: string;
}): Promise<CategoryConfigItem[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("categories")
    .select("id,name,active")
    .eq("tenant_id", tenantId)
    .order("active", { ascending: false })
    .order("name");

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudieron cargar las categorias.");
  }

  const rows = (data ?? []) as CategoryRow[];
  const categoryIds = rows.map((category) => category.id);
  const categoryCounts = new Map<string, number>();

  if (categoryIds.length > 0) {
    const productCategoriesResult = await supabase
      .from("products")
      .select("category_id")
      .eq("tenant_id", tenantId)
      .in("category_id", categoryIds);

    if (productCategoriesResult.error) {
      throw new Error("No se pudo calcular el uso de las categorias.");
    }

    for (const row of (productCategoriesResult.data ?? []) as ProductCategoryRow[]) {
      if (row.category_id) {
        categoryCounts.set(
          row.category_id,
          (categoryCounts.get(row.category_id) ?? 0) + 1
        );
      }
    }
  }

  return rows.map((category) => ({
    id: category.id,
    name: category.name,
    active: category.active !== false,
    productsCount: categoryCounts.get(category.id) ?? 0,
  }));
}
