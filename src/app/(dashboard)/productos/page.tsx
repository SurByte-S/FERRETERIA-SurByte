import { PackageSearch } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { ProductosResumen } from "@/components/productos/productos-resumen";

export default function ProductosPage() {
  return (
    <>
      <PageHeader
        title="Productos"
        description="Busca, carga y revisa los articulos disponibles en cada ferreteria."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <ProductosResumen />
        <EmptyState
          icon={PackageSearch}
          title="Catalogo listo para conectar"
          text="La base esta preparada para leer productos desde Supabase cuando cargues las tablas del tenant."
          actionHref="/presupuestos"
          actionLabel="Crear presupuesto"
        />
      </div>
    </>
  );
}
