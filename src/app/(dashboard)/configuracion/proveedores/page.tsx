import Link from "next/link";
import { Search } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import {
  SuppliersPanel,
  type SupplierConfigItem,
} from "../configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase";

type ProveedoresPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export default async function ConfiguracionProveedoresPage({
  searchParams,
}: ProveedoresPageProps) {
  const params = await searchParams;
  const q = cleanSearch(params.q);
  const tenant = await requireConfigurationTenant("/configuracion/proveedores");
  const suppliers = await loadSuppliers({ q, tenantId: tenant.id });

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Crear, buscar y editar proveedores."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-5xl gap-4 pb-6">
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 md:flex-row md:items-end md:justify-between">
          <form
            action="/configuracion/proveedores"
            className="grid flex-1 gap-2 md:grid-cols-[1fr_auto] md:items-end"
          >
            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar proveedor</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Nombre, telefono o email"
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

        <SuppliersPanel suppliers={suppliers} />
      </div>
    </>
  );
}

function cleanSearch(value: string | undefined) {
  return String(value ?? "").trim().replace(/[%_,()]/g, "");
}

async function loadSuppliers({
  q,
  tenantId,
}: {
  q: string;
  tenantId: string;
}): Promise<SupplierConfigItem[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("suppliers")
    .select("id,name,phone,email,address,notes")
    .eq("tenant_id", tenantId)
    .order("name");

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudieron cargar los proveedores.");
  }

  return ((data ?? []) as SupplierRow[]).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
  }));
}
