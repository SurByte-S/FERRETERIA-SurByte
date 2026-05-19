import { StockCsvUploadCard } from "@/components/productos/stock-csv-upload-card";
import { PageHeader } from "@/components/shell/page-header";

export default function StockCargaRapidaPage() {
  return (
    <>
      <PageHeader
        title="Carga rapida por CSV"
        description="Subi un archivo con codigo y cantidad para sumar stock automaticamente."
        backHref="/stock"
        backLabel="Volver a stock"
      />

      <div className="max-w-5xl">
        <StockCsvUploadCard />
      </div>
    </>
  );
}
