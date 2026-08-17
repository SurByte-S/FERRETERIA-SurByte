export type PrintPaperSize = "a4" | "a5" | "ticket_80mm";

export type PrintTenantBusinessDetails = {
  name: string;
  business_name: string | null;
  tax_id: string | null;
  address: string | null;
};

export type TenantInvoiceSettingsRow = {
  legal_name: string | null;
  cuit: string | null;
  iva_condition: string | null;
  fiscal_address: string | null;
  sale_point: string | null;
  gross_income: string | null;
  activity_start_date: string | null;
  invoice_footer_text: string | null;
  print_paper_size: PrintPaperSize | null;
};

export type PrintInvoiceSettings = {
  legalName: string | null;
  cuit: string | null;
  ivaCondition: string | null;
  fiscalAddress: string | null;
  salePoint: string | null;
  grossIncome: string | null;
  activityStartDate: string | null;
  invoiceFooterText: string | null;
  printPaperSize: PrintPaperSize;
};

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();

  return cleanValue ? cleanValue : null;
}

function cleanPrintPaperSize(
  value: string | null | undefined
): PrintPaperSize {
  return value === "ticket_80mm" || value === "a5" || value === "a4"
    ? value
    : "a4";
}

export function buildPrintInvoiceSettings(
  tenantDetails: PrintTenantBusinessDetails | null,
  invoiceSettings: TenantInvoiceSettingsRow | null
): PrintInvoiceSettings {
  return {
    legalName:
      cleanText(invoiceSettings?.legal_name) ??
      cleanText(tenantDetails?.business_name) ??
      cleanText(tenantDetails?.name),
    cuit: cleanText(invoiceSettings?.cuit) ?? cleanText(tenantDetails?.tax_id),
    ivaCondition: cleanText(invoiceSettings?.iva_condition),
    fiscalAddress:
      cleanText(invoiceSettings?.fiscal_address) ??
      cleanText(tenantDetails?.address),
    salePoint: cleanText(invoiceSettings?.sale_point),
    grossIncome: cleanText(invoiceSettings?.gross_income),
    activityStartDate: cleanText(invoiceSettings?.activity_start_date),
    invoiceFooterText: cleanText(invoiceSettings?.invoice_footer_text),
    printPaperSize: cleanPrintPaperSize(invoiceSettings?.print_paper_size),
  };
}
