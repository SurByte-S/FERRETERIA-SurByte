import {
  Boxes,
  ClipboardList,
  History,
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
    title: "Administracion",
    href: "/ajustes",
    icon: LayoutGrid,
    description: "Opciones del encargado",
  },
] as const;

export const adminGroupItems = [
  {
    title: "Historial",
    href: "/ajustes/historial",
    icon: History,
    description: "Ventas, presupuestos y clientes.",
  },
  {
    title: "Configuracion",
    href: "/ajustes/configuracion",
    icon: Settings,
    description: "Productos y datos de la ferreteria.",
  },
] as const;

export const historyItems = [
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
] as const;

export const configurationItems = [
  {
    title: "Editar productos",
    href: "/productos",
    icon: PackageSearch,
    description: "Cambiar datos, fotos y detalles de productos.",
  },
  {
    title: "Datos de la ferreteria",
    href: "/configuracion",
    icon: Settings,
    description: "Nombre, datos y preferencias.",
  },
] as const;
