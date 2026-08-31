"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  lookupQuoteProductByCodeAction,
  saveQuoteAction,
  saveQuoteAndConvertToSaleAction,
  searchProductsForPosAction,
  updateQuoteAction,
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
const PAGE_SIZE_OPTIONS = [10, 15, 20] as const;
const DEFAULT_PAGE_SIZE = 20;
const BARCODE_SCAN_MIN_LENGTH = 4;
const BARCODE_SCAN_MAX_INTERVAL_MS = 80;
const BARCODE_NOT_FOUND_MESSAGE =
  "No encontramos un producto con ese codigo.";

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

function isProductSearchInputTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('[data-pos-product-search="true"]'));
}

function isScannerBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (isProductSearchInputTarget(target)) {
    return false;
  }

  return Boolean(
    (target instanceof HTMLElement && target.isContentEditable) ||
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
      )
  );
}

function hasVisibleDialog() {
  const dialogs = document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"][aria-modal="true"]'
  );

  return Array.from(dialogs).some((dialog) => {
    const styles = window.getComputedStyle(dialog);

    return (
      styles.display !== "none" &&
      styles.visibility !== "hidden" &&
      dialog.getClientRects().length > 0
    );
  });
}

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

function parseQuantity(value: string) {
  return Number(value.replace(",", "."));
}

function emptyQuoteCustomer(): QuoteCustomer {
  return {
    id: "",
    name: "",
    phone: "",
    email: "",
    address: "",
  };
}

function normalizeQuoteCustomerForSave(customer: QuoteCustomer): QuoteCustomer {
  return {
    id: customer.id?.trim() ?? "",
    name: customer.name.trim(),
    phone: customer.phone.trim(),
    email: customer.email.trim(),
    address: customer.address.trim(),
  };
}

function formatQuantityInput(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return "1";
  }

  if (Number.isInteger(quantity) && quantity > 0 && quantity < 10) {
    return String(quantity).padStart(2, "0");
  }

  return String(quantity);
}

function clampQuantity(value: number) {
  return Math.max(0.001, Math.round(value * 1000) / 1000);
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

function normalizeSaleUnitName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isSimpleSaleUnit(unit: ProductSaleUnit) {
  const simpleNames = new Set(["u", "und", "unid", "unidad", "unidades", "unit"]);

  return (
    unit.active &&
    simpleNames.has(normalizeSaleUnitName(unit.name)) &&
    Math.abs(Number(unit.quantityInBaseUnit) - 1) < EPSILON &&
    !getSaleUnitBarcode(unit) &&
    (unit.isDefault || !unit.id)
  );
}

function getSaleUnitBarcode(saleUnit: ProductSaleUnit | null | undefined) {
  return saleUnit?.barcode?.trim() ?? "";
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
  cashStatus,
  customers,
  editingQuoteNumber,
  initialCustomer,
  initialLines = [],
  initialLoadMessage,
  initialMode = "sale",
  initialQuoteId,
  initialSku,
}: {
  cashStatus?: CashStatus;
  customers: QuoteCustomerOption[];
  editingQuoteNumber?: number | string;
  initialCustomer?: QuoteCustomer;
  initialLines?: QuoteLine[];
  initialLoadMessage?: string;
  initialMode?: SaleMode;
  initialQuoteId?: string;
  initialSku?: string;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef(initialSku ?? "");
  const latestSearchRequestRef = useRef(0);
  const barcodeBufferRef = useRef("");
  const barcodeLastKeyAtRef = useRef(0);
  const barcodeScanPendingRef = useRef(false);
  const barcodeScanProcessingRef = useRef(false);
  const barcodeScanQueueRef = useRef<string[]>([]);
  const barcodeSearchTermRef = useRef("");
  const [customer, setCustomer] = useState<QuoteCustomer>(
    initialCustomer ?? emptyQuoteCustomer()
  );
  const [search, setSearch] = useState(initialSku ?? "");
  const [mode, setMode] = useState<SaleMode>(initialMode);
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [lines, setLines] = useState<QuoteLine[]>(initialLines);
  const linesRef = useRef<QuoteLine[]>([]);
  const [message, setMessage] = useState(initialLoadMessage ?? EMPTY_SEARCH_MESSAGE);
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
  const isEditingQuote = Boolean(initialQuoteId);
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
  const showPageSizeSelector = totalPages > 1;
  const actionHelp = getActionHelp({
    linesCount: lines.length,
    isCashRegisterClosed,
    hasOutOfStockLines,
    hasGroupedStockIssue: Boolean(groupedStockIssue),
    isQuoteMode,
  });
  const saleActionDisabled =
    isPending ||
    lines.length === 0 ||
    hasOutOfStockLines ||
    Boolean(groupedStockIssue) ||
    isCashRegisterClosed;

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

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
          nextPageSize,
          { prioritizeInStock: isQuoteMode }
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
    const hadSearchTerm = searchRef.current.trim().length > 0;
    const lineKey = getLineKey(product.id, selectedSaleUnit.id);

    let wasAdded = false;
    let stockMessage = "";

    flushSync(() => {
      setLines((currentLines) => {
        const nextConsumption =
          getProductBaseConsumption(currentLines, product.id) +
          selectedSaleUnit.quantityInBaseUnit;

        if (!isQuoteMode && nextConsumption - product.stockQuantity > EPSILON) {
          stockMessage = getGroupedStockMessage({
            productName: product.name || product.description,
            stockQuantity: product.stockQuantity,
            consumption: nextConsumption,
          });
          wasAdded = false;
          linesRef.current = currentLines;
          return currentLines;
        }

        const existingLine = currentLines.find(
          (line) => getLineKey(line.id, line.selectedSaleUnitId) === lineKey
        );
        const nextLines = existingLine
          ? currentLines.map((line) =>
              getLineKey(line.id, line.selectedSaleUnitId) === lineKey
                ? {
                    ...line,
                    quantity: line.quantity + 1,
                  }
                : line
            )
          : [
              ...currentLines,
              {
                ...product,
                code: getSaleUnitBarcode(selectedSaleUnit) || product.displayCode,
                displayCode:
                  getSaleUnitBarcode(selectedSaleUnit) || product.displayCode,
                matchedBy: getSaleUnitBarcode(selectedSaleUnit)
                  ? "sale_unit_barcode"
                  : product.matchedBy,
                matchedSaleUnitId: selectedSaleUnit.id || product.matchedSaleUnitId,
                price: product.price,
                quantity: 1,
                selectedSaleUnitId: selectedSaleUnit.id,
                selectedSaleUnitName: selectedSaleUnit.name,
                quantityInBaseUnit: selectedSaleUnit.quantityInBaseUnit,
                availableForSale:
                  product.stockQuantity >= selectedSaleUnit.quantityInBaseUnit,
              },
            ];

        wasAdded = true;
        stockMessage = "";
        linesRef.current = nextLines;
        return nextLines;
      });
    });

    if (!wasAdded) {
      if (stockMessage) {
        setMessage(stockMessage);
      }
      return false;
    }

    if (!isQuoteMode) {
      searchRef.current = "";
      setSearch("");
      setPage(1);
      if (hadSearchTerm) {
        setResults([]);
        setResultsTotal(0);
        setSearchStatus("idle");
        latestSearchRequestRef.current += 1;
      }
    }
    setMessage(
      isQuoteMode ? "Producto agregado al presupuesto." : "Producto agregado a la venta."
    );
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return true;
  }, [isQuoteMode]);

  const processBarcodeScanQueue = useCallback(async () => {
    if (barcodeScanProcessingRef.current) {
      return;
    }

    barcodeScanProcessingRef.current = true;
    barcodeScanPendingRef.current = true;

    try {
      while (barcodeScanQueueRef.current.length > 0) {
        const code = barcodeScanQueueRef.current.shift();

        if (!code) {
          continue;
        }

        barcodeSearchTermRef.current = code;
        latestSearchRequestRef.current += 1;
        setSearch(code);
        setPage(1);
        setMessage("Buscando productos...");
        setSearchStatus("loading");

        try {
          const result = await lookupQuoteProductByCodeAction(code, isQuoteMode);

          if (result.ok && result.product) {
            const wasAdded = addProduct(result.product);

            if (wasAdded) {
              setMessage(`Agregado: ${result.product.name || result.product.description}`);
            }

            continue;
          }

          const matchingProducts = result.product ? [result.product] : [];
          setResults(matchingProducts);
          setResultsTotal(matchingProducts.length);
          setSearchStatus(
            matchingProducts.length > 0
              ? "results"
              : result.status === "not_found"
                ? "empty"
                : "error"
          );
          setMessage(result.message ?? BARCODE_NOT_FOUND_MESSAGE);
        } catch {
          setResults([]);
          setResultsTotal(0);
          setSearchStatus("error");
          setMessage("No se pudo buscar el producto. Intenta nuevamente.");
        } finally {
          barcodeBufferRef.current = "";
          barcodeLastKeyAtRef.current = 0;
        }
      }
    } finally {
      barcodeScanProcessingRef.current = false;
      barcodeScanPendingRef.current = false;
      barcodeBufferRef.current = "";
      barcodeLastKeyAtRef.current = 0;
    }
  }, [addProduct, isQuoteMode]);

  const lookupAndShowProductByCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();

      barcodeBufferRef.current = "";
      barcodeLastKeyAtRef.current = 0;

      if (!code) {
        return;
      }

      barcodeScanQueueRef.current.push(code);
      void processBarcodeScanQueue();
    },
    [processBarcodeScanQueue]
  );

  useEffect(() => {
    barcodeBufferRef.current = "";
    barcodeLastKeyAtRef.current = 0;

    function handleBarcodeKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        isScannerBlockedTarget(event.target) ||
        isScannerBlockedTarget(document.activeElement) ||
        hasVisibleDialog()
      ) {
        barcodeBufferRef.current = "";
        barcodeLastKeyAtRef.current = 0;
        return;
      }

      const now = performance.now();

      if (event.key === "Enter") {
        const code = barcodeBufferRef.current.trim();
        const lastKeyInterval = now - barcodeLastKeyAtRef.current;

        barcodeBufferRef.current = "";
        barcodeLastKeyAtRef.current = 0;

        if (
          code.length >= BARCODE_SCAN_MIN_LENGTH &&
          lastKeyInterval <= BARCODE_SCAN_MAX_INTERVAL_MS
        ) {
          event.preventDefault();
          lookupAndShowProductByCode(code);
        }

        return;
      }

      if (event.key === "Tab" || event.key === "Escape") {
        barcodeBufferRef.current = "";
        barcodeLastKeyAtRef.current = 0;
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      if (
        barcodeLastKeyAtRef.current > 0 &&
        now - barcodeLastKeyAtRef.current > BARCODE_SCAN_MAX_INTERVAL_MS
      ) {
        barcodeBufferRef.current = "";
      }

      barcodeBufferRef.current += event.key;
      barcodeLastKeyAtRef.current = now;
    }

    window.addEventListener("keydown", handleBarcodeKeyDown);

    return () => {
      window.removeEventListener("keydown", handleBarcodeKeyDown);
      barcodeBufferRef.current = "";
      barcodeLastKeyAtRef.current = 0;
    };
  }, [lookupAndShowProductByCode, mode]);

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

    if (barcodeSearchTermRef.current) {
      const shouldSkipSearch = barcodeSearchTermRef.current === term;
      barcodeSearchTermRef.current = "";

      if (shouldSkipSearch) {
        return;
      }
    }

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
    searchRef.current = value;
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
        pageSize,
        { prioritizeInStock: isQuoteMode }
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
      const code = barcodeBufferRef.current.trim();
      const lastKeyInterval = performance.now() - barcodeLastKeyAtRef.current;

      if (
        code.length >= BARCODE_SCAN_MIN_LENGTH &&
        lastKeyInterval <= BARCODE_SCAN_MAX_INTERVAL_MS
      ) {
        event.preventDefault();
        lookupAndShowProductByCode(code);
        return;
      }

      event.preventDefault();
      runSearch();
    }
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

  function updateLineQuantity(lineKey: string, value: string) {
    const nextQuantity = parseQuantity(value);
    const selectedLine = lines.find(
      (line) => getLineKey(line.id, line.selectedSaleUnitId) === lineKey
    );

    if (!selectedLine) {
      return false;
    }

    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setMessage("La cantidad debe ser mayor a 0.");
      return false;
    }

    const safeQuantity = clampQuantity(nextQuantity);
    const currentLineConsumption = getLineStockUsage(selectedLine);
    const nextLineConsumption = safeQuantity * selectedLine.quantityInBaseUnit;
    const nextProductConsumption =
      getProductBaseConsumption(lines, selectedLine.id) -
      currentLineConsumption +
      nextLineConsumption;

    if (!isQuoteMode && nextProductConsumption - selectedLine.stockQuantity > EPSILON) {
      setMessage(
        getGroupedStockMessage({
          productName: selectedLine.name || selectedLine.description,
          stockQuantity: selectedLine.stockQuantity,
          consumption: nextProductConsumption,
        })
      );
      return false;
    }

    setLines((current) =>
      current.map((line) =>
        getLineKey(line.id, line.selectedSaleUnitId) === lineKey
          ? {
              ...line,
              quantity: safeQuantity,
            }
          : line
      )
    );
    return true;
  }

  function removeLine(lineKey: string) {
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
    if (initialQuoteId) {
      updateQuote();
      return;
    }

    saveQuoteAsNew();
  }

  function updateQuote() {
    if (!initialQuoteId) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await updateQuoteAction({
        customer: normalizeQuoteCustomerForSave(customer),
        lines,
        quoteId: initialQuoteId,
      });

      if (result.ok && result.quoteId) {
        router.push(`/presupuestos/${result.quoteId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  function saveQuoteAsNew() {
    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAction({
        customer: normalizeQuoteCustomerForSave(customer),
        lines,
      });

      if (result.ok && result.quoteId) {
        router.push(`/presupuestos/${result.quoteId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  function finalizeSale({ openReceipt }: { openReceipt: boolean }) {
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
        if (openReceipt) {
          router.push(`/ventas/${result.saleId}?print=1`);
          return;
        }

        setLines([]);
        setCustomer(emptyQuoteCustomer());
        setPaymentMethod(PAYMENT_METHODS[0]);
        setPaidAmount("");
        setMessage("Venta guardada en historial.");
        router.refresh();
        return;
      }

      setMessage(result.message);
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-5.75rem)] gap-2 bg-background p-1 lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      <header className="grid shrink-0 gap-2 rounded-md border-2 border-border bg-card p-2 shadow-sm">
        <div className="grid min-w-0 gap-1 rounded-md border border-border bg-secondary p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={searchInputRef}
              data-pos-product-search="true"
              aria-label="Buscar producto"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={SEARCH_PLACEHOLDER}
              className="h-11 min-w-[14rem] flex-1 rounded-md border border-input bg-card px-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
            />
            <Button
              type="button"
              onClick={runSearch}
              disabled={isPending}
              className="h-11 w-full rounded-md text-base font-black sm:w-36"
            >
              Buscar
            </Button>
            <select
              aria-label="Modo de venta"
              value={mode}
              onChange={(event) => changeMode(event.target.value as SaleMode)}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-base font-black text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 sm:w-44"
            >
              <option value="sale">Venta</option>
              <option value="quote">Presupuesto</option>
            </select>
            {!isQuoteMode && cashStatus ? (
              <CashBadge cashStatus={cashStatus} />
            ) : null}
          </div>

          {visibleMessage ? (
            <p className="rounded-md border border-primary/20 bg-secondary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              {visibleMessage}
            </p>
          ) : null}

          {isEditingQuote ? (
            <div className="rounded-md border border-primary/30 bg-card px-3 py-2">
              <p className="text-sm font-black text-primary">
                Editando presupuesto {editingQuoteNumber ? `#${editingQuoteNumber}` : ""}
              </p>
              <p className="text-sm font-semibold text-foreground">
                Podes actualizar este presupuesto o guardarlo como uno nuevo.
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="grid min-h-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch lg:overflow-hidden">
        <section className="grid min-h-[18rem] min-w-0 overflow-hidden rounded-md border-2 border-border bg-card shadow-sm lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 border-b-2 border-primary/30 bg-card px-3 py-2 text-foreground">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-black">Productos encontrados</h2>
                {resultCounter ? (
                  <p className="text-sm font-bold text-primary">
                    {resultCounter}
                  </p>
                ) : null}
              </div>

              {showPageSizeSelector ? (
                <label className="flex shrink-0 items-center gap-2 text-sm font-bold text-foreground">
                  Por pagina
                  <select
                    value={pageSize}
                    onChange={(event) => changePageSize(event.target.value)}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm font-black text-foreground"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="min-h-0 overflow-y-auto bg-secondary px-3 pb-3 pt-2">
              {results.length > 0 ? (
                <div className="grid gap-2">
                  {results.map((product) => (
                    <ProductRow
                      key={`${product.id}:${product.matchedSaleUnitId ?? ""}`}
                      product={product}
                      isQuoteMode={isQuoteMode}
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

        <aside className="flex min-h-[22rem] min-w-0 flex-col overflow-hidden rounded-md border-2 border-border bg-card shadow-sm lg:min-h-0">
          <div className="shrink-0 border-b-2 border-primary/30 bg-card px-3 py-2 text-foreground">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <h2 className="text-xl font-black leading-tight text-primary">
                {isQuoteMode ? "Presupuesto actual" : "Venta actual"}
              </h2>
              <p className="text-sm font-semibold text-muted-foreground">
                {`${lines.length} producto${
                  lines.length === 1 ? "" : "s"
                } agregado${lines.length === 1 ? "" : "s"}`}
              </p>
              <p className="rounded-md border border-primary/30 bg-background px-2 py-1 text-sm font-black text-primary">
                {isQuoteMode ? "Presupuesto" : "Ticket"}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-secondary p-2.5">
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
                      onQuantityChange={(value) => updateLineQuantity(lineKey, value)}
                      onRemove={() => removeLine(lineKey)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t-2 border-border bg-card p-2.5">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div
                className={
                  isQuoteMode ? "grid gap-2" : "grid w-full max-w-lg gap-2"
                }
              >
                <div
                  className={
                    isQuoteMode
                      ? "grid gap-2 md:grid-cols-2"
                      : "grid gap-2 sm:grid-cols-2"
                  }
                >
                  {!isQuoteMode ? (
                    <Field label="Forma de pago">
                      <select
                        value={paymentMethod}
                        onChange={(event) =>
                          changePaymentMethod(event.target.value)
                        }
                        className="h-10 w-full rounded-md border border-input bg-muted/30 px-3 text-base font-semibold"
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}

                  <details
                    className={
                      isQuoteMode
                        ? "rounded-md border border-border bg-muted/30 md:col-span-2"
                        : "rounded-md border border-border bg-muted/30"
                    }
                  >
                    <summary
                      className={
                        isQuoteMode
                          ? "flex h-12 cursor-pointer items-center px-3 text-base font-black"
                          : "flex h-10 cursor-pointer items-center px-3 text-base font-black"
                      }
                    >
                      {isQuoteMode ? "Cliente opcional" : "Cliente"}
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
                      <div className="grid gap-2">
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

                  {!isQuoteMode && isCreditSale ? (
                    <div className="grid gap-2 sm:col-span-2">
                      <Field label="Importe pagado ahora">
                        <input
                          value={paidAmount}
                          onChange={(event) =>
                            setPaidAmount(event.target.value)
                          }
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
                    </div>
                  ) : null}

                  {!isQuoteMode ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => finalizeSale({ openReceipt: false })}
                        disabled={saleActionDisabled}
                        className="h-11 w-full text-base font-black"
                      >
                        Cobrar venta
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => finalizeSale({ openReceipt: true })}
                        disabled={saleActionDisabled}
                        className="h-11 w-full text-base font-black"
                      >
                        Imprimir
                      </Button>
                    </>
                  ) : null}
                </div>

                {isQuoteMode ? (
                  <div className="grid gap-2">
                    <Button
                      type="button"
                      onClick={saveQuote}
                      disabled={isPending || lines.length === 0}
                      className="h-12 w-full px-4 text-base font-black"
                    >
                      {isEditingQuote
                        ? "Actualizar presupuesto"
                        : "Guardar presupuesto"}
                    </Button>
                    {isEditingQuote ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={saveQuoteAsNew}
                          disabled={isPending || lines.length === 0}
                          className="h-11 w-full px-3 text-sm font-black"
                        >
                          Guardar como nuevo presupuesto
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          className="h-11 w-full px-3 text-sm font-black"
                        >
                          <Link href="/presupuestos">Cancelar edicion</Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 lg:w-64 lg:text-right">
                <p className="text-sm font-black uppercase tracking-wide text-foreground">
                  {isQuoteMode ? "Total presupuesto" : "Total"}
                </p>
                <p
                  className={
                    isQuoteMode
                      ? "truncate text-[2.75rem] font-black leading-none text-primary"
                      : "truncate text-[2.25rem] font-black leading-none text-primary"
                  }
                >
                  {formatMoney(total)}
                </p>

                {actionHelp ? (
                  <p className="mt-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-bold text-foreground">
                    {actionHelp}
                  </p>
                ) : null}
              </div>
            </div>
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
      <div className="rounded-md border border-destructive/40 bg-card p-4">
        <p className="text-lg font-black text-destructive">No se pudo buscar.</p>
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
          ? "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-emerald-700/50 bg-card px-3 text-foreground sm:w-44"
          : "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-destructive/50 bg-card px-3 text-foreground sm:w-44"
      }
    >
      <span
        className={
          cashStatus.open
            ? "text-sm font-black text-emerald-800"
            : "text-sm font-black text-destructive"
        }
      >
        {cashStatus.open ? "Abierta" : "Cerrada"}
      </span>
      <Button asChild variant="outline" className="h-8 px-2 text-sm font-bold">
        <Link href="/caja">{cashStatus.open ? "Ver caja" : "Abrir caja"}</Link>
      </Button>
    </div>
  );
}

function ProductRow({
  isQuoteMode,
  product,
  onAdd,
}: {
  isQuoteMode: boolean;
  product: QuoteProduct;
  onAdd: (saleUnit: ProductSaleUnit) => void;
}) {
  const defaultSaleUnit = getDefaultSaleUnit(product);
  const [selectedSaleUnitId, setSelectedSaleUnitId] = useState(defaultSaleUnit.id);
  const selectedSaleUnit =
    product.saleUnits.find((unit) => unit.id === selectedSaleUnitId) ??
    defaultSaleUnit;
  const isOutOfStock = !product.availableForSale;
  const canAddProduct = isQuoteMode || product.availableForSale;
  const activeSaleUnits = product.saleUnits.filter((unit) => unit.active);
  const availableSaleUnits =
    activeSaleUnits.length > 0 ? activeSaleUnits : [defaultSaleUnit];
  const showSaleUnitSelector =
    availableSaleUnits.length !== 1 || !isSimpleSaleUnit(availableSaleUnits[0]);

  return (
    <div
      className={
        showSaleUnitSelector
          ? "grid gap-2 rounded-md border border-border bg-card p-2 shadow-sm md:grid-cols-[5rem_minmax(0,1fr)_9.6rem_6.3rem_7.2rem_7.2rem] md:items-center"
          : "grid gap-2 rounded-md border border-border bg-card p-2 shadow-sm md:grid-cols-[5rem_minmax(0,1fr)_6.3rem_7.2rem_7.2rem] md:items-center"
      }
    >
      <div>
        <p className="text-sm font-bold text-muted-foreground md:hidden">Propio</p>
        <p className="font-mono text-lg font-black leading-tight text-primary">
          {product.customCode || "-"}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-muted-foreground md:hidden">
          Producto
        </p>
        <p className="line-clamp-2 text-base font-black leading-tight">
          {product.name || product.description}
        </p>
      </div>
      {showSaleUnitSelector ? (
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
      ) : null}
      <div>
        <p className="text-sm font-bold text-muted-foreground">Stock</p>
        <p className="text-lg font-black">
          {formatStockQuantity(product.stockQuantity)} {product.unit}
        </p>
        {isOutOfStock ? (
          <p className="text-sm font-black text-yellow-900">Sin stock</p>
        ) : null}
      </div>
      <div>
        <p className="text-sm font-bold text-muted-foreground">Precio</p>
        <p className="text-lg font-black text-primary">
          {formatMoney(product.price)}
        </p>
      </div>
      <Button
        type="button"
        onClick={() => onAdd(selectedSaleUnit)}
        disabled={!canAddProduct}
        className="h-10 px-3 text-base font-black"
      >
        {canAddProduct ? "Agregar" : "Sin stock"}
      </Button>
    </div>
  );
}

function TicketLine({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: QuoteLine;
  onQuantityChange: (value: string) => boolean;
  onRemove: () => void;
}) {
  const [isQuantityEditing, setIsQuantityEditing] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState("");
  const quantityText = isQuantityEditing
    ? quantityDraft
    : formatQuantityInput(line.quantity);
  const lineTotal = line.quantity * line.price;

  function changeQuantityBy(delta: number) {
    const nextQuantity = Math.max(1, line.quantity + delta);
    const nextValue = String(Math.round(nextQuantity * 1000) / 1000);

    if (onQuantityChange(nextValue)) {
      if (isQuantityEditing) {
        setQuantityDraft(nextValue);
      }
      return;
    }

    if (isQuantityEditing) {
      setQuantityDraft(String(line.quantity));
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2">
      <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] md:items-center">
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={onRemove}
            className="h-8 w-fit shrink-0 border-red-300 bg-red-50 px-3 text-sm font-bold text-red-800 hover:bg-red-100"
          >
            Quitar
          </Button>
        </div>
        <p
          className="min-w-0 truncate text-sm font-black leading-tight"
          title={line.description}
        >
          {line.description}
        </p>
        <label className="flex items-center gap-2 md:justify-end">
          <span className="text-sm font-bold text-muted-foreground">
            Cantidad
          </span>
          <span className="flex items-center gap-1">
            <input
              value={quantityText}
              onFocus={() => {
                setIsQuantityEditing(true);
                setQuantityDraft(String(line.quantity));
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                const nextQuantity = parseQuantity(nextValue);

                setQuantityDraft(nextValue);

                if (Number.isFinite(nextQuantity) && nextQuantity > 0) {
                  const accepted = onQuantityChange(nextValue);

                  if (!accepted) {
                    setQuantityDraft(String(line.quantity));
                  }
                }
              }}
              onBlur={() => {
                if (!onQuantityChange(quantityText)) {
                  setQuantityDraft(String(line.quantity));
                }
                setIsQuantityEditing(false);
              }}
              type="text"
              inputMode="decimal"
              className="h-10 w-20 rounded-md border border-input bg-background px-2 text-center text-sm font-black"
              aria-label={`Cantidad de ${line.description}`}
            />
            <span className="grid gap-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => changeQuantityBy(1)}
                className="h-[1.15rem] w-8 px-0 text-xs font-black leading-none"
                aria-label="Aumentar cantidad"
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeQuantityBy(-1)}
                className="h-[1.15rem] w-8 px-0 text-xs font-black leading-none"
                aria-label="Disminuir cantidad"
              >
                ▼
              </Button>
            </span>
          </span>
        </label>
        <div className="min-w-[6rem] text-sm font-bold text-muted-foreground md:text-right">
          <p className="text-xs uppercase tracking-normal">Unitario</p>
          <p className="text-foreground">{formatMoney(line.price)}</p>
        </div>
        <div className="min-w-[6rem] text-sm font-bold md:text-right">
          <p className="text-xs uppercase tracking-normal text-muted-foreground">
            Total
          </p>
          <p className="text-lg leading-tight text-primary">
            {formatMoney(lineTotal)}
          </p>
        </div>
      </div>
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
