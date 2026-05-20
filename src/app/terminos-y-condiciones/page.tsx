import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terminos y Condiciones | LLAVE MAESTRA",
  description: "Terminos y Condiciones de Uso de la plataforma de ferreteria.",
};

export default function TerminosYCondicionesPage() {
  return (
    <LegalDocument
      fileName="terminos-y-condiciones.md"
      updatedAtFallback="[Fecha de ultima actualizacion]"
    />
  );
}
