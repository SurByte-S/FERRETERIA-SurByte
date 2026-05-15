import { Settings } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Datos de la ferreteria"
        description="Datos importantes de la ferreteria."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <EmptyState
        icon={Settings}
        title="Datos del negocio"
        text="Aca se cargaran los datos del negocio y opciones importantes."
        actionHref="/inicio"
        actionLabel="Volver al inicio"
      />
    </>
  );
}
