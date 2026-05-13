import { Settings } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Define datos de la ferreteria, sucursales y preferencias de uso."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <EmptyState
        icon={Settings}
        title="Ajustes iniciales"
        text="Aca se conectaran los datos del negocio, usuarios y opciones por tenant."
        actionHref="/inicio"
        actionLabel="Volver al inicio"
      />
    </>
  );
}
