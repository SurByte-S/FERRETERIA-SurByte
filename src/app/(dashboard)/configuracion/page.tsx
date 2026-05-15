import { Settings } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Datos de la ferreteria"
        description="Define datos de la ferreteria, sucursales y preferencias de uso."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <EmptyState
        icon={Settings}
        title="Datos del negocio"
        text="Aca se conectaran los datos del negocio, usuarios y opciones del sistema."
        actionHref="/inicio"
        actionLabel="Volver al inicio"
      />
    </>
  );
}
