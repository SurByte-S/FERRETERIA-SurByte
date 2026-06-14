"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  lookupQuoteProductByCodeAction,
  saveQuoteAction,
  saveQuoteAndConvertToSaleAction,
  searchProductsForPosAction,
} from "@/app/(dashboard)/presupuestos/nuevo/actions";
import type {
  QuoteCustomer,
  QuoteCustomerOption,
  QuoteLine,
  QuoteProduct,
  ProductSaleUnit,
} from "@/components/presupuestos/quote-types";
import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";

const EMPTY_SEARCH_MESSAGE = "Busca un producto para empezar.";
const SEARCH_PLACEHOLDER = "Buscar por codigo o nombre";
const CASH_REGISTER_CLOSED_MESSAGE = "Para vender necesitas abrir la caja.";
const EPSILON = 0.000001;
const PAGE_SIZE_OPTIONS = [20, 40, 80] as const;
const DEFAULT_PAGE_SIZE = 40;

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

type SaleMode = "sale" | "quote";

type CashStatus =
  | { open: true; openedAt: string; expectedCash: number }
  | { open: false };

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error";

function normalizeFormattedText(value: string) {
  return value.replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

function formatMoney(value: number) {
  return normalizeFormattedText(
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    }).format(value)
  );
}

function getDefaultSaleUnit(product: QuoteProduct) {
  return (
    product.saleUnits.find(
      (unit) => unit.id === product.matchedSaleUnitId && unit.active
    ) ??
    product.saleUnits.find((unit) => unit.isDefault && unit.active) ??
    product.saleUnits.find((unit) => unit.active) ?? {
      id: "",
      name: "Unidad",
      quantityInBaseUnit: 1,
      salePrice: product.price,
      barcode: "",
      isDefault: true,
      active: true,
    }
  );
}

function getSaleUnitBarcode(saleUnit: ProductSaleUnit | null | undefined) {
  return saleUnit?.barcode?.trim() ?? "";
}

function getCodeDisplay(
  product: QuoteProduct,
  saleUnit?: ProductSaleUnit | null
) {
  const saleUnitBarcode = getSaleUnitBarcode(saleUnit);

  if (saleUnitBarcode) {
    return {
      label: `Codigo de presentacion: ${saleUnitBarcode}`,
      secondaryLabel: `Presentacion: ${saleUnit?.name ?? "Unidad"}`,
    };
  }

  if (product.matchedBy === "product_barcode" && product.productBarcode) {
    return {
      label: `Codigo de barras: ${product.productBarcode}`,
      secondaryLabel: `Codigo interno: ${product.sku}`,
    };
  }

  return {
    label: `Codigo interno: ${product.sku}`,
    secondaryLabel:
      product.productBarcode && product.productBarcode !== product.sku
        ? `Codigo de barras: ${product.productBarcode}`
        : "",
  };
}

function getLineCodeDisplay(line: QuoteLine) {
  const selectedSaleUnit = line.selectedSaleUnitId
    ? line.saleUnits.find((unit) => unit.id === line.selectedSaleUnitId)
    : null;

  return getCodeDisplay(line, selectedSaleUnit).label;
}

function getMatchSourceLabel(product: QuoteProduct) {
  if (product.matchedBy === "product_barcode") {
    return "Encontrado por codigo de barras";
  }

  if (product.matchedBy === "sale_unit_barcode") {
    return "Encontrado por codigo de presentacion";
  }

  if (product.matchedBy === "sku") {
    return "Encontrado por codigo interno";
  }

  return "Encontrado por texto";
}

function getLineKey(productId: string, saleUnitId: string) {
  return `${productId}:${saleUnitId || "fallback"}`;
}

function getLineStockUsage(line: Pick<QuoteLine, "quantity" | "quantityInBaseUnit">) {
  return Number(line.quantity) * Number(line.quantityInBaseUnit);
}

function getProductBaseConsumption(
  cartItems: Pick<QuoteLine, "id" | "quantity" | "quantityInBaseUnit">[],
  productId: string
) {
  return cartItems
    .filter((item) => item.id === productId)
    .reduce((sum, item) => sum + getLineStockUsage(item), 0);
}

function getGroupedStockMessage({
  productName,
  stockQuantity,
  consumption,
}: {
  productName: string;
  stockQuantity: number;
  consumption: number;
}) {
  return `Stock insuficiente para ${productName}. Disponible: ${formatStockQuantity(
    stockQuantity
  )}. En carrito: ${formatStockQuantity(consumption)}.`;
}

function findGroupedStockIssue(lines: QuoteLine[]) {
  for (const line of lines) {
    const consumption = getProductBaseConsumption(lines, line.id);

    if (consumption - Number(line.stockQuantity) > EPSILON) {
      return {
        line,
        consumption,
      };
    }
  }

  return null;
}

export function QuickSalePos({
  initialSku,
  customers,
  cashStatus,
}: {
  initialSku?: string;
  customers: QuoteCustomerOption[];
  cashStatus?: CashStatus;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestSearchRequestRef = useRef(0);
  const [customer, setCustomer] = useState<QuoteCustomer>({
    id: "",
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [search, setSearch] = useState(initialSku ?? "");
  const [mode, setMode] = useState<SaleMode>("sale");
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const linesRef = useRef<QuoteLine[]>([]);
  const [message, setMessage] = useState(EMPTY_SEARCH_MESSAGE);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paidAmount, setPaidAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines]
  );
  const hasOutOfStockLines = useMemo(
    () => lines.some((line) => !line.availableForSale),
    [lines]
  );
  const groupedStockIssue = useMemo(() => findGroupedStockIssue(lines), [lines]);
  const isQuoteMode = mode === "quote";
  const isCashRegisterClosed = !isQuoteMode && cashStatus?.open === false;
  const isCreditSale = paymentMethod === "Cuenta corriente";
  const paidAmountValue =
    paidAmount === "" ? (isCreditSale ? 0 : total) : Number(paidAmount);
  const pendingAmount =
    Number.isFinite(paidAmountValue) && paidAmountValue >= 0
      ? Math.max(total - paidAmountValue, 0)
      : total;
  const visibleMessage =
    message && message !== EMPTY_SEARCH_MESSAGE ? message : "";
  const totalPages = Math.max(1, Math.ceil(resultsTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const resultStart = resultsTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const resultEnd = Math.min(currentPage * pageSize, resultsTotal);
  const resultCounter = getResultCounter({
    status: searchStatus,
    start: resultStart,
    end: resultEnd,
    visibleCount: results.length,
    total: resultsTotal,
  });
  const showPaginationControls = totalPages > 1;
  const actionHelp = getActionHelp({
    linesCount: lines.length,
    isCashRegisterClosed,
    hasOutOfStockLines,
    hasGroupedStockIssue: Boolean(groupedStockIssue),
    isQuoteMode,
  });

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const runProductSearch = useCallback(
    ({
      term,
      nextPage,
      nextPageSize,
      showMessage = false,
    }: {
      term: string;
      nextPage: number;
      nextPageSize: number;
      showMessage?: boolean;
    }) => {
      const requestId = latestSearchRequestRef.current + 1;
      latestSearchRequestRef.current = requestId;
      setSearchStatus("loading");

      if (showMessage) {
        setMessage("Buscando productos...");
      }

      startTransition(async () => {
        const result = await searchProductsForPosAction(
          term,
          isQuoteMode,
          nextPage,
          nextPageSize
        );

        if (latestSearchRequestRef.current !== requestId) {
          return;
        }

        if (!result.ok) {
          setResults([]);
          setResultsTotal(0);
          setSearchStatus("error");
          setMessage(result.message ?? "No se pudieron buscar productos.");
          return;
        }

        setResults(result.items);
        setResultsTotal(result.total);
        setSearchStatus(result.total > 0 ? "results" : "empty");
        setMessage(
          result.total > 0
            ? ""
            : "No encontramos productos. Proba buscar por menos palabras o por codigo."
        );
      });
    },
    [isQuoteMode, startTransition]
  );

  const addProduct = useCallback((product: QuoteProduct, saleUnit?: ProductSaleUnit) => {
    const selectedSaleUnit = saleUnit ?? getDefaultSaleUnit(product);
    const lineKey = getLineKey(product.id, selectedSaleUnit.id);

    const nextConsumption =
      getProductBaseConsumption(linesRef.current, product.id) +
      selectedSaleUnit.quantityInBaseUnit;

    if (nextConsumption - product.stockQuantity > EPSILON) {
      setMessage(
        getGroupedStockMessage({
          productName: product.name || product.description,
          stockQuantity: product.stockQuantity,
          consumption: nextConsumption,
        })
      );
      return;
    }

    const existing = linesRef.current.find(
      (line) => getLineKey(line.id, line.selectedSaleUnitId) === lineKey
    );

    setLines((current) =>
      existing
        ? current.map((line) =>
            getLineKey(line.id, line.selectedSaleUnitId) === lineKey
              ? {
                  ...line,
                  quantity: line.quantity + 1,
                }
              : line
          )
        : [
            ...current,
            {
              ...product,
              code: getSaleUnitBarcode(selectedSaleUnit) || product.displayCode,
              displayCode:
                getSaleUnitBarcode(selectedSaleUnit) || product.displayCode,
              matchedBy: getSaleUnitBarcode(selectedSaleUnit)
                ? "sale_unit_barcode"
                : product.matchedBy,
              matchedSaleUnitId: selectedSaleUnit.id || product.matchedSaleUnitId,
              price: selectedSaleUnit.salePrice,
              quantity: 1,
              selectedSaleUnitId: selectedSaleUnit.id,
              selectedSaleUnitName: selectedSaleUnit.name,
              quantityInBaseUnit: selectedSaleUnit.quantityInBaseUnit,
              availableForSale:
                product.stockQuantity >= selectedSaleUnit.quantityInBaseUnit,
            },
          ]
    );
    setSearch("");
    setResults([]);
    setResultsTotal(0);
    setPage(1);
    setSearchStatus("idle");
    latestSearchRequestRef.current += 1;
    setMessage("Producto agregado a la venta.");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!initialSku) {
      return;
    }

    startTransition(async () => {
      const result = await lookupQuoteProductByCodeAction(initialSku, isQuoteMode);

      if (result.ok && result.product) {
        addProduct(result.product);
      } else if (result.message) {
        setMessage(result.message);
      }
    });
  }, [addProduct, initialSku, isQuoteMode]);

  useEffect(() => {
    const term = search.trim();

    const timeoutId = window.setTimeout(() => {
      runProductSearch({
        term,
        nextPage: page,
        nextPageSize: pageSize,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [page, pageSize, runProductSearch, search]);

  function changeMode(nextMode: SaleMode) {
    setMode(nextMode);
    setResults([]);
    setResultsTotal(0);
    setPage(1);
    setSearchStatus("idle");
    setMessage(
      nextMode === "quote"
        ? "Modo presupuesto: podes guardar sin cobrar."
        : EMPTY_SEARCH_MESSAGE
    );
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function runSearch() {
    const term = search.trim();
    const nextPage = 1;
    setPage(nextPage);

    if (!term) {
      runProductSearch({
        term,
        nextPage,
        nextPageSize: pageSize,
        showMessage: true,
      });
      searchInputRef.current?.focus();
      return;
    }

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    setMessage("Buscando productos...");
    setSearchStatus("loading");
    startTransition(async () => {
      const exact = await lookupQuoteProductByCodeAction(term, isQuoteMode);

      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      if (exact.ok && exact.product) {
        addProduct(exact.product);
        return;
      }

      if (exact.status !== "not_found" && exact.message) {
        setResults(exact.product ? [exact.product] : []);
        setResultsTotal(exact.product ? 1 : 0);
        setSearchStatus(exact.product ? "results" : "error");
        setMessage(exact.message);
        return;
      }

      const result = await searchProductsForPosAction(
        term,
        isQuoteMode,
        nextPage,
        pageSize
      );

      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      if (!result.ok) {
        setResults([]);
        setResultsTotal(0);
        setSearchStatus("error");
        setMessage(result.message ?? "No se pudieron buscar productos.");
        return;
      }

      setResults(result.items);
      setResultsTotal(result.total);
      setSearchStatus(result.total > 0 ? "results" : "empty");
      setMessage(
        result.total > 0
          ? ""
          : "No encontramos productos. Proba buscar por menos palabras o por codigo."
      );
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
  }

  function changePageSize(value: string) {
    const nextPageSize = Number(value);
    setPageSize(
      PAGE_SIZE_OPTIONS.includes(
        nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]
      )
        ? nextPageSize
        : DEFAULT_PAGE_SIZE
    );
    setPage(1);
  }

  function incrementLineQuantity(lineKey: string) {
    const selectedLine = lines.find(
      (line) => getLineKey(line.id, line.selectedSaleUnitId) === lineKey
    );

    if (!selectedLine) {
      return;
    }

    const nextConsumption =
      getProductBaseConsumption(lines, selectedLine.id) +
      selectedLine.quantityInBaseUnit;

    if (nextConsumption - selectedLine.stockQuantity > EPSILON) {
      setMessage(
        getGroupedStockMessage({
          productName: selectedLine.name || selectedLine.description,
          stockQuantity: selectedLine.stockQuantity,
          consumption: nextConsumption,
        })
      );
      return;
    }

    setLines((current) =>
      current.map((line) =>
        getLineKey(line.id, line.selectedSaleUnitId) === lineKey
          ? {
              ...line,
              quantity: line.quantity + 1,
            }
          : line
      )
    );
  }

  function decrementLineQuantity(lineKey: string) {
    setLines((current) =>
      current.map((line) =>
        getLineKey(line.id, line.selectedSaleUnitId) === lineKey
          ? { ...line, quantity: Math.max(1, line.quantity - 1) }
          : line
      )
    );
  }

  function removeLine(lineKey: string) {
    const confirmed = window.confirm(
      "Vas a quitar este producto. Queres continuar?"
    );

    if (!confirmed) {
      return;
    }

    setLines((current) =>
      current.filter(
        (line) => getLineKey(line.id, line.selectedSaleUnitId) !== lineKey
      )
    );
  }

  function updateCustomer(key: keyof QuoteCustomer, value: string) {
    setCustomer((current) => ({ ...current, [key]: value }));
  }

  function selectCustomer(customerId: string) {
    const selected = customers.find((item) => item.id === customerId);

    if (!selected) {
      setCustomer({
        id: "",
        name: "",
        phone: "",
        email: "",
        address: "",
      });
      return;
    }

    setCustomer({
      id: selected.id,
      name: selected.name,
      phone: selected.phone ?? "",
      email: selected.email ?? "",
      address: selected.address ?? "",
    });
  }

  function changePaymentMethod(nextPaymentMethod: string) {
    setPaymentMethod(nextPaymentMethod);
    setPaidAmount(nextPaymentMethod === "Cuenta corriente" ? "0" : "");
  }

  function saveQuote() {
    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAction({ customer, lines });

      if (result.ok && result.quoteId) {
        router.push(`/presupuestos/${result.quoteId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  function registerSale() {
    if (isCashRegisterClosed) {
      setMessage(CASH_REGISTER_CLOSED_MESSAGE);
      return;
    }

    if (hasOutOfStockLines) {
      setMessage("Stock insuficiente. Revisa las cantidades antes de vender.");
      return;
    }

    const stockIssue = findGroupedStockIssue(lines);

    if (stockIssue) {
      setMessage(
        getGroupedStockMessage({
          productName: stockIssue.line.name || stockIssue.line.description,
          stockQuantity: stockIssue.line.stockQuantity,
          consumption: stockIssue.consumption,
        })
      );
      return;
    }

    const amount = Number(
      paidAmount === ""
        ? paymentMethod === "Cuenta corriente"
          ? 0
          : total
        : paidAmount
    );

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Revisa el monto pagado.");
      return;
    }

    if (amount - total > EPSILON) {
      setMessage("El importe pagado no puede superar el total.");
      return;
    }

    if (paymentMethod === "Cuenta corriente" && !customer.id) {
      setMessage("Para vender a cuenta corriente, elegi un cliente guardado.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAndConvertToSaleAction({
        customer,
        lines,
        paymentMethod,
        paidAmount: amount,
      });

      if (result.ok && result.saleId) {
        router.push(`/ventas/${result.saleId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-5.75rem)] gap-2 bg-background p-1 lg:grid-rows-[auto_1fr]">
      <header className="grid shrink-0 gap-2 rounded-md border-2 border-border bg-card p-2 shadow-sm xl:grid-cols-[minmax(20rem,auto)_minmax(22rem,1fr)_auto] xl:items-stretch">
        <div className="grid min-w-0 gap-1 rounded-md border border-border bg-secondary p-2">
          <div className="min-h-5 min-w-0">
            <h1 className="text-xl font-black leading-tight text-primary">
              Mostrador
            </h1>
          </div>

          <div className="grid min-w-[16rem] grid-cols-[minmax(6rem,1fr)_minmax(8rem,1fr)] gap-1 rounded-md border border-border bg-card p-1">
            <ModeButton
              active={mode === "sale"}
              label="Venta"
              onClick={() => changeMode("sale")}
            />
            <ModeButton
              active={mode === "quote"}
              label="Presupuesto"
              onClick={() => changeMode("quote")}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-1 rounded-md border border-border bg-secondary p-2">
          <label className="grid min-w-0 gap-1">
            <span className="min-h-5 text-base font-black leading-tight">
              Buscar producto
            </span>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={SEARCH_PLACEHOLDER}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              />
              <Button
                type="button"
                onClick={runSearch}
                disabled={isPending}
                className="h-11 rounded-md text-base font-black"
              >
                Buscar
              </Button>
            </div>
          </label>

          {visibleMessage ? (
            <p className="rounded-md border border-primary/20 bg-secondary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              {visibleMessage}
            </p>
          ) : null}
        </div>

        {!isQuoteMode && cashStatus ? (
          <CashBadge cashStatus={cashStatus} />
        ) : null}
      </header>

      <main className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_clamp(27rem,31vw,33rem)] lg:items-start">
        <section className="grid rounded-md border-2 border-border bg-card shadow-sm lg:grid-rows-[auto_1fr]">
          <div className="grid min-h-[18rem] grid-rows-[auto_1fr]">
            <div className="grid min-h-[3.25rem] gap-2 border-b-2 border-border bg-primary px-3 py-2 text-primary-foreground xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-black">Productos encontrados</h2>
                {resultCounter ? (
                  <p className="text-sm font-bold text-primary-foreground">
                    {resultCounter}
                  </p>
                ) : null}
              </div>

              {showPaginationControls ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-primary-foreground">
                    Por pagina
                    <select
                      value={pageSize}
                      onChange={(event) => changePageSize(event.target.value)}
                      className="h-10 rounded-md border border-border bg-background px-2 text-sm font-black text-foreground"
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-sm font-bold text-primary-foreground">
                    Pagina {currentPage} de {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToPage(1)}
                    disabled={isPending || currentPage <= 1}
                    className="h-10 px-3 text-sm font-bold"
                  >
                    Primera
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={isPending || currentPage <= 1}
                    className="h-10 px-3 text-sm font-bold"
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={isPending || currentPage >= totalPages}
                    className="h-10 px-3 text-sm font-bold"
                  >
                    Siguiente
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToPage(totalPages)}
                    disabled={isPending || currentPage >= totalPages}
                    className="h-10 px-3 text-sm font-bold"
                  >
                    Ultima
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="bg-secondary px-3 pb-3 pt-2">
              {results.length > 0 ? (
                <div className="grid gap-2">
                  {results.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onAdd={(saleUnit) => addProduct(product, saleUnit)}
                    />
                  ))}
                </div>
              ) : (
                <SearchStatePanel status={searchStatus} />
              )}
            </div>
          </div>
        </section>

        <aside className="grid rounded-md border-2 border-border bg-card shadow-sm">
          <div className="border-b-2 border-border bg-primary px-3 py-2 text-primary-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black leading-tight">
                  {isQuoteMode ? "Presupuesto actual" : "Venta actual"}
                </h2>
                {lines.length > 0 ? (
                  <p className="text-sm font-semibold opacity-90">
                    {`${lines.length} producto${
                      lines.length === 1 ? "" : "s"
                    } agregado${lines.length === 1 ? "" : "s"}.`}
                  </p>
                ) : null}
              </div>
              <p className="rounded-md bg-primary-foreground/15 px-2 py-1 text-sm font-black">
                Ticket
              </p>
            </div>
          </div>

          <div className="bg-secondary p-2.5">
            {lines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card p-4">
                <p className="text-lg font-black">No hay productos agregados.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {lines.map((line) => {
                  const lineKey = getLineKey(line.id, line.selectedSaleUnitId);

                  return (
                    <TicketLine
                      key={lineKey}
                      line={line}
                      onDecrement={() => decrementLineQuantity(lineKey)}
                      onIncrement={() => incrementLineQuantity(lineKey)}
                      onRemove={() => removeLine(lineKey)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t-2 border-border bg-card p-2.5">
            {!isQuoteMode ? (
              <div className="mb-2 grid gap-2">
                <Field label="Forma de pago">
                  <select
                    value={paymentMethod}
                    onChange={(event) => changePaymentMethod(event.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-muted/30 px-3 text-base font-semibold"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </Field>
                {isCreditSale ? (
                  <>
                    <Field label="Importe pagado ahora">
                      <input
                        value={paidAmount}
                        onChange={(event) => setPaidAmount(event.target.value)}
                        type="number"
                        min="0"
                        max={total}
                        step="0.01"
                        className="h-11 rounded-md border border-input bg-muted/30 px-3 text-base font-semibold"
                      />
                    </Field>
                    <div className="rounded-md border border-border bg-card px-3 py-2">
                      <p className="text-sm font-black uppercase tracking-wide text-foreground">
                        Saldo a cuenta
                      </p>
                      <p className="text-lg font-black text-primary">
                        {formatMoney(pendingAmount)}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <div
              className={
                isQuoteMode
                  ? "grid gap-2"
                  : "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              }
            >
              <div className="min-w-0">
                <div className="flex items-end justify-between gap-3 sm:block">
                  <p className="text-sm font-black uppercase tracking-wide text-foreground">
                    {isQuoteMode ? "Total presupuesto" : "Total"}
                  </p>
                  <p className="truncate text-4xl font-black leading-none text-primary">
                    {formatMoney(total)}
                  </p>
                </div>

                {actionHelp ? (
                  <p className="mt-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-bold text-foreground">
                    {actionHelp}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                {isQuoteMode ? (
                  <Button
                    type="button"
                    onClick={saveQuote}
                    disabled={isPending || lines.length === 0}
                    className="h-14 w-full px-4 text-lg font-black"
                  >
                    Guardar presupuesto
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      onClick={registerSale}
                      disabled={
                        isPending ||
                        lines.length === 0 ||
                        hasOutOfStockLines ||
                        Boolean(groupedStockIssue) ||
                        isCashRegisterClosed
                      }
                      className="h-14 w-full text-lg font-black"
                    >
                      Cobrar venta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={saveQuote}
                      disabled={isPending || lines.length === 0}
                      className="h-12 text-base font-bold"
                    >
                      Guardar presupuesto
                    </Button>
                  </>
                )}
              </div>
            </div>

            <details className="mt-2 rounded-md border border-border bg-muted/30">
              <summary className="flex min-h-10 cursor-pointer items-center px-3 text-base font-black">
                Cliente opcional
              </summary>
              <div className="grid gap-2 border-t border-border p-3">
                <Field label="Cliente guardado">
                  <select
                    value={customer.id ?? ""}
                    onChange={(event) => selectCustomer(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-base"
                  >
                    <option value="">Sin cliente guardado</option>
                    {customers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nombre">
                  <input
                    value={customer.name}
                    onChange={(event) =>
                      updateCustomer("name", event.target.value)
                    }
                    disabled={Boolean(customer.id)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-base"
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Field label="Telefono">
                    <input
                      value={customer.phone}
                      onChange={(event) =>
                        updateCustomer("phone", event.target.value)
                      }
                      disabled={Boolean(customer.id)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-base"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={customer.email}
                      onChange={(event) =>
                        updateCustomer("email", event.target.value)
                      }
                      disabled={Boolean(customer.id)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-base"
                    />
                  </Field>
                </div>
                <Field label="Domicilio">
                  <input
                    value={customer.address}
                    onChange={(event) =>
                      updateCustomer("address", event.target.value)
                    }
                    disabled={Boolean(customer.id)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-base"
                  />
                </Field>
              </div>
            </details>
          </div>
        </aside>
      </main>
    </div>
  );
}

function getActionHelp({
  linesCount,
  isCashRegisterClosed,
  hasOutOfStockLines,
  hasGroupedStockIssue,
  isQuoteMode,
}: {
  linesCount: number;
  isCashRegisterClosed: boolean;
  hasOutOfStockLines: boolean;
  hasGroupedStockIssue: boolean;
  isQuoteMode: boolean;
}) {
  if (isQuoteMode) {
    return linesCount === 0 ? "Agrega productos para guardar." : "";
  }

  if (isCashRegisterClosed) {
    return CASH_REGISTER_CLOSED_MESSAGE;
  }

  if (hasOutOfStockLines || hasGroupedStockIssue) {
    return "Stock insuficiente. Revisa las cantidades antes de vender.";
  }

  if (linesCount === 0) {
    return "Agrega productos para cobrar.";
  }

  return "";
}

function getResultCounter({
  status,
  start,
  end,
  visibleCount,
  total,
}: {
  status: SearchStatus;
  start: number;
  end: number;
  visibleCount: number;
  total: number;
}) {
  if (status === "idle") {
    return "";
  }

  if (status === "loading") {
    return "Buscando...";
  }

  if (status === "empty") {
    return "Mostrando 0 de 0 productos";
  }

  if (status === "error") {
    return "Error de busqueda";
  }

  if (total === 0 || visibleCount === 0) {
    return "Mostrando 0 de 0 productos";
  }

  return `${start}-${end} de ${total} productos`;
}

function SearchStatePanel({ status }: { status: SearchStatus }) {
  if (status === "loading") {
    return (
      <div className="rounded-md border border-border bg-background p-4">
        <p className="text-lg font-black">Buscando productos...</p>
        <p className="mt-1 text-base font-semibold text-muted-foreground">
          Espera un momento.
        </p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-md border border-dashed border-border bg-background p-4">
        <p className="text-lg font-black">No encontramos productos.</p>
        <p className="mt-1 text-base font-semibold text-muted-foreground">
          Proba buscar por menos palabras o por codigo.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-lg font-black">No se pudo buscar.</p>
        <p className="mt-1 text-base font-semibold text-muted-foreground">
          Revisa la conexion e intenta nuevamente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-background p-4">
      <p className="text-lg font-black">Busca un producto para empezar.</p>
    </div>
  );
}

function CashBadge({ cashStatus }: { cashStatus: CashStatus }) {
  return (
    <div
      className={
        cashStatus.open
          ? "flex h-full min-w-[13rem] items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-emerald-800"
          : "flex h-full min-w-[13rem] items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive"
      }
    >
      <div>
        <p className="text-base font-black">
          {cashStatus.open
            ? "Caja abierta"
            : "Caja cerrada - no se puede cobrar"}
        </p>
        {cashStatus.open ? (
          <p className="text-sm font-bold">
            Efectivo: {formatMoney(cashStatus.expectedCash)}
          </p>
        ) : null}
      </div>
      <Button asChild variant="outline" className="h-9 px-3 text-sm font-bold">
        <Link href="/caja">{cashStatus.open ? "Ver caja" : "Abrir caja"}</Link>
      </Button>
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className="h-9 min-w-0 px-4 text-base font-black"
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

function ProductRow({
  product,
  onAdd,
}: {
  product: QuoteProduct;
  onAdd: (saleUnit: ProductSaleUnit) => void;
}) {
  const defaultSaleUnit = getDefaultSaleUnit(product);
  const [selectedSaleUnitId, setSelectedSaleUnitId] = useState(defaultSaleUnit.id);
  const selectedSaleUnit =
    product.saleUnits.find((unit) => unit.id === selectedSaleUnitId) ??
    defaultSaleUnit;
  const codeDisplay = getCodeDisplay(product, selectedSaleUnit);

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2 shadow-sm md:grid-cols-[minmax(0,1fr)_9.6rem_6.3rem_7.2rem_7.2rem] md:items-center">
      <div className="min-w-0">
        <p className="line-clamp-2 text-base font-black leading-tight">
          {product.name || product.description}
        </p>
        <p className="font-mono text-sm font-semibold text-muted-foreground">
          {codeDisplay.label}
        </p>
        <p className="text-sm font-bold text-emerald-700">
          {getMatchSourceLabel(product)}
        </p>
        {codeDisplay.secondaryLabel ? (
          <p className="font-mono text-sm font-semibold text-muted-foreground">
            {codeDisplay.secondaryLabel}
          </p>
        ) : null}
        {product.brand || product.category ? (
          <p className="truncate text-sm font-semibold text-muted-foreground">
            {[product.brand, product.category].filter(Boolean).join(" - ")}
          </p>
        ) : null}
      </div>
      <label className="grid gap-1">
        <span className="text-sm font-bold text-muted-foreground">
          Presentacion
        </span>
        <select
          value={selectedSaleUnitId}
          onChange={(event) => setSelectedSaleUnitId(event.target.value)}
          className="h-10 rounded-md border border-input bg-muted/30 px-2 text-sm font-black"
        >
          {product.saleUnits.map((unit) => (
            <option key={unit.id || "fallback"} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <InfoBlock
        label="Stock"
        value={`${formatStockQuantity(product.stockQuantity)} ${product.unit}`}
      />
      <div>
        <p className="text-sm font-bold text-muted-foreground">Precio</p>
        <p className="text-lg font-black text-primary">
          {formatMoney(selectedSaleUnit.salePrice)}
        </p>
      </div>
      <Button
        type="button"
        onClick={() => onAdd(selectedSaleUnit)}
        disabled={!product.availableForSale}
        className="h-10 px-3 text-base font-black"
      >
        {product.availableForSale ? "Agregar" : "Sin stock"}
      </Button>
    </div>
  );
}

function TicketLine({
  line,
  onDecrement,
  onIncrement,
  onRemove,
}: {
  line: QuoteLine;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-black leading-tight">
            {line.description}
          </p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">
            {getLineCodeDisplay(line)}
          </p>
          <p className="text-sm font-semibold text-muted-foreground">
            {line.selectedSaleUnitName} x {formatStockQuantity(line.quantityInBaseUnit)} {line.unit}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRemove}
          className="h-8 shrink-0 px-3 text-sm font-bold"
        >
          Quitar
        </Button>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <div className="grid grid-cols-[2.4rem_3.3rem_2.4rem] gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={onDecrement}
            className="h-8 px-0 text-lg font-black"
            aria-label={`Restar cantidad de ${line.description}`}
          >
            -
          </Button>
          <div className="grid h-8 place-items-center rounded-md border border-input bg-background text-sm font-black">
            {line.quantity}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onIncrement}
            className="h-8 px-0 text-lg font-black"
            aria-label={`Sumar cantidad de ${line.description}`}
          >
            +
          </Button>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {formatMoney(line.price)} c/u
          </p>
          <p className="text-lg font-black text-primary">
            {formatMoney(line.quantity * line.price)}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-foreground">{label}</p>
      <p className="text-base font-black">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      <span>{label}</span>
      {children}
    </label>
  );
}
