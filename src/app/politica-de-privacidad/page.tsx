import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Politica de Privacidad | LLAVE MAESTRA",
  description: "Politica de Privacidad de la plataforma de ferreteria.",
};

export default function PoliticaDePrivacidadPage() {
  return (
    <LegalDocument
      fileName="politica-de-privacidad.md"
      updatedAtFallback="[Fecha de ultima actualizacion]"
    />
  );
}
