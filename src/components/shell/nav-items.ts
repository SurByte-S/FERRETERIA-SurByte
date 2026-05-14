import {
  Boxes,
  ClipboardList,
  LayoutGrid,
  PackageSearch,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

export const navigationItems = [
  {
    title: "Vender",
    href: "/inicio",
    icon: ShoppingCart,
    description: "Buscar, agregar y cobrar",
  },
  {
    title: "Caja",
    href: "/caja",
    icon: WalletCards,
    description: "Abrir y cerrar caja diaria",
  },
  {
    title: "Stock",
    href: "/stock",
    icon: Boxes,
    description: "Ver stock y cambiar precios",
  },
] as const;

export const secondaryNavigationItems = [
  {
    title: "Mas opciones",
    href: "/ajustes",
    icon: LayoutGrid,
    description: "Clientes, ventas y configuracion",
  },
] as const;

export const adminItems = [
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Datos de clientes y cuenta corriente",
  },
  {
    title: "Historial de ventas",
    href: "/ventas",
    icon: ShoppingCart,
    description: "Ventas realizadas e impresion de comprobantes",
  },
  {
    title: "Presupuestos",
    href: "/presupuestos",
    icon: ClipboardList,
    description: "Presupuestos guardados",
  },
  {
    title: "Configuracion",
    href: "/configuracion",
    icon: Settings,
    description: "Datos de la ferreteria y preferencias",
  },
  {
    title: "Productos avanzados",
    href: "/productos",
    icon: PackageSearch,
    description: "Edicion completa, fotos e historial",
  },
] as const;
