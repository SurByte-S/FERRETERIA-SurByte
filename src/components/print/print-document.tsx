import { Wrench } from "lucide-react";

export type PrintBusiness = {
  name: string;
  subtitle?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
};

export type PrintDocumentMeta = {
  typeLabel: string;
  numberLabel: string;
  shortId?: string;
  dateLabel: string;
  statusLabel: string;
  paymentMethod?: string | null;
  cashLabel?: string | null;
  sellerLabel?: string | null;
};

export type PrintCustomer = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type PrintItem = {
  code?: string | null;
  description: string;
  quantity: number | string;
  unitPrice: string;
  total: string;
};

export type PrintTotalRow = {
  label: string;
  value: string;
  emphasis?: "normal" | "strong" | "warning";
};

type PrintDocumentProps = {
  business: PrintBusiness;
  document: PrintDocumentMeta;
  customer: PrintCustomer | null;
  items: PrintItem[];
  totals: PrintTotalRow[];
  finalTotalLabel: string;
  finalTotal: string;
  badgeLabel?: string | null;
  note: string;
  footerMessage: string;
};

function visibleText(value: string | null | undefined, fallback: string) {
  const cleanValue = value?.trim();
  return cleanValue ? cleanValue : fallback;
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <p>
      <span>{label}</span>
      <strong>{visibleText(value, "No configurado")}</strong>
    </p>
  );
}

function PrintHeader({
  business,
  document,
  badgeLabel,
}: {
  business: PrintBusiness;
  document: PrintDocumentMeta;
  badgeLabel?: string | null;
}) {
  return (
    <header className="print-header">
      <div className="print-brand">
        <div className="print-logo" aria-hidden="true">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl} alt="" />
          ) : (
            <Wrench className="size-7" strokeWidth={1.8} />
          )}
        </div>
        <div>
          <p className="print-kicker">
            {visibleText(
              business.subtitle,
              "Ferreteria / Herramientas / Buloneria / Sanitarios"
            )}
          </p>
          <h1>{business.name}</h1>
          <div className="print-contact-grid">
            <DetailLine label="Direccion" value={business.address} />
            <DetailLine label="Telefono / WhatsApp" value={business.phone} />
            <DetailLine label="Email" value={business.email} />
            <DetailLine label="CUIT" value={business.taxId} />
          </div>
        </div>
      </div>

      <div className="print-document-meta">
        {badgeLabel ? <p className="print-badge">{badgeLabel}</p> : null}
        <p className="print-kicker">Documento interno</p>
        <h2>{document.typeLabel}</h2>
        <dl>
          <div>
            <dt>Numero</dt>
            <dd>{document.numberLabel}</dd>
          </div>
          {document.shortId ? (
            <div>
              <dt>ID</dt>
              <dd>{document.shortId}</dd>
            </div>
          ) : null}
          <div>
            <dt>Fecha</dt>
            <dd>{document.dateLabel}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{document.statusLabel}</dd>
          </div>
          {document.paymentMethod ? (
            <div>
              <dt>Pago</dt>
              <dd>{document.paymentMethod}</dd>
            </div>
          ) : null}
          {document.cashLabel ? (
            <div>
              <dt>Caja</dt>
              <dd>{document.cashLabel}</dd>
            </div>
          ) : null}
          {document.sellerLabel ? (
            <div>
              <dt>Usuario</dt>
              <dd>{document.sellerLabel}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  );
}

function PrintCustomerBox({ customer }: { customer: PrintCustomer | null }) {
  const customerName = customer?.name?.trim() || "Consumidor final";

  return (
    <section className="print-section print-customer">
      <div>
        <p className="print-section-label">Cliente</p>
        <h3>{customerName}</h3>
      </div>
      <div className="print-customer-details">
        <DetailLine label="Telefono" value={customer?.phone} />
        <DetailLine label="Direccion" value={customer?.address} />
        <DetailLine label="Email" value={customer?.email} />
      </div>
    </section>
  );
}

function PrintItemsTable({ items }: { items: PrintItem[] }) {
  return (
    <section className="print-section">
      <div className="print-section-heading">
        <p className="print-section-label">Detalle</p>
        <p>{items.length} item{items.length === 1 ? "" : "s"}</p>
      </div>
      <div className="print-table-wrap">
        <table className="print-items-table">
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Descripcion</th>
              <th className="print-number">Cantidad</th>
              <th className="print-number">Precio unitario</th>
              <th className="print-number">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.code ?? "sin-codigo"}-${item.description}-${index}`}>
                <td className="print-code">{item.code || "-"}</td>
                <td>{item.description}</td>
                <td className="print-number">{item.quantity}</td>
                <td className="print-number">{item.unitPrice}</td>
                <td className="print-number print-line-total">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintTotalsBox({
  totals,
  finalTotalLabel,
  finalTotal,
}: {
  totals: PrintTotalRow[];
  finalTotalLabel: string;
  finalTotal: string;
}) {
  return (
    <section className="print-summary">
      <div className="print-summary-note">
        <p className="print-section-label">Observaciones</p>
        <p>
          Revise cantidades, precios y condiciones antes de confirmar la
          operacion.
        </p>
      </div>
      <div className="print-totals-box">
        {totals.map((row) => (
          <div
            key={row.label}
            className={
              row.emphasis === "warning"
                ? "print-total-row print-total-warning"
                : row.emphasis === "strong"
                  ? "print-total-row print-total-strong"
                  : "print-total-row"
            }
          >
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
        <div className="print-grand-total">
          <span>{finalTotalLabel}</span>
          <strong>{finalTotal}</strong>
        </div>
      </div>
    </section>
  );
}

function PrintFooter({
  business,
  note,
  footerMessage,
}: {
  business: PrintBusiness;
  note: string;
  footerMessage: string;
}) {
  const contact = [
    business.phone ? `Tel. ${business.phone}` : null,
    business.email ?? null,
    business.address ?? null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <footer className="print-footer">
      <div>
        <strong>{footerMessage}</strong>
        <p>{note}</p>
        <p>Comprobante interno no valido como factura fiscal.</p>
      </div>
      <p>{contact || "Datos de contacto no configurados"}</p>
    </footer>
  );
}

export function PrintDocument({
  business,
  document,
  customer,
  items,
  totals,
  finalTotalLabel,
  finalTotal,
  badgeLabel,
  note,
  footerMessage,
}: PrintDocumentProps) {
  return (
    <article className="print-document">
      <PrintHeader
        business={business}
        document={document}
        badgeLabel={badgeLabel}
      />
      <PrintCustomerBox customer={customer} />
      <PrintItemsTable items={items} />
      <PrintTotalsBox
        totals={totals}
        finalTotalLabel={finalTotalLabel}
        finalTotal={finalTotal}
      />
      <PrintFooter
        business={business}
        note={note}
        footerMessage={footerMessage}
      />
    </article>
  );
}
