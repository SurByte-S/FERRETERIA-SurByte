import {
  ClipboardList,
  Home,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

export const navigationItems = [
  {
    title: "Inicio",
    href: "/inicio",
    icon: Home,
    description: "Ver accesos principales",
  },
  {
    title: "Venta rapida",
    href: "/presupuestos/nuevo",
    icon: ShoppingCart,
    description: "Armar y cobrar desde mostrador",
  },
  {
    title: "Productos",
    href: "/productos",
    icon: PackageSearch,
    description: "Consultar precios y stock",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Guardar datos y cuenta corriente",
  },
  {
    title: "Ventas",
    href: "/ventas",
    icon: ShoppingCart,
    description: "Registrar ventas del mostrador",
  },
  {
    title: "Caja",
    href: "/caja",
    icon: WalletCards,
    description: "Abrir y cerrar caja diaria",
  },
  {
    title: "Presupuestos",
    href: "/presupuestos",
    icon: ClipboardList,
    description: "Revisar presupuestos guardados",
  },
  {
    title: "Ajustes",
    href: "/configuracion",
    icon: Settings,
    description: "Ajustar datos de la ferreteria",
  },
] as const;

export const quickActions = [
  {
    title: "Nuevo presupuesto",
    href: "/presupuestos/nuevo",
    icon: ReceiptText,
    description: "Preparar una lista de productos con precio para entregar.",
  },
  {
    title: "Buscar productos",
    href: "/productos",
    icon: PackageSearch,
    description: "Encontrar articulos por nombre, codigo o rubro.",
  },
  {
    title: "Venta rapida",
    href: "/presupuestos/nuevo",
    icon: ShoppingCart,
    description: "Armar el comprobante y convertirlo en venta.",
  },
  {
    title: "Abrir caja",
    href: "/caja",
    icon: WalletCards,
    description: "Controlar efectivo y cierre diario.",
  },
] as const;
