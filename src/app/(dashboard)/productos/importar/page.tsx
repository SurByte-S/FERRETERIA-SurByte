import { ImportProductsForm } from "@/components/productos/import-products-form";
import { PageHeader } from "@/components/shell/page-header";

export default function ImportarProductosPage() {
  return (
    <>
      <PageHeader
        title="Importar productos"
        description="Carga un CSV, revisa una vista previa y actualiza el catalogo sin duplicar SKU."
        backHref="/productos"
        backLabel="Volver a productos"
      />
      <ImportProductsForm />
    </>
  );
}
