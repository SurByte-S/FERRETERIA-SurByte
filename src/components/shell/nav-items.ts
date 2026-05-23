import {
  Boxes,
  ChartColumn,
  ClipboardList,
  History,
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
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Datos de clientes y cuenta corriente",
  },
  {
    title: "Estadísticas",
    href: "/estadisticas",
    icon: ChartColumn,
    description: "Ventas por día, caja y resumen del negocio.",
  },
  {
    title: "Presupuestos",
    href: "/presupuestos",
    icon: ClipboardList,
    description: "Presupuestos guardados",
  },
  {
    title: "Stock",
    href: "/stock",
    icon: Boxes,
    description: "Ver stock y cambiar precios",
  },
] as const;

export const secondaryNavigationItems = [
] as const;

export const adminGroupItems = [
  {
    title: "Revisar ventas y clientes",
    href: "/ajustes/historial",
    icon: History,
    description: "Ventas realizadas, presupuestos guardados y datos de clientes.",
  },
  {
    title: "Editar datos",
    href: "/ajustes/configuracion",
    icon: Settings,
    description: "Productos, precios y datos de la ferreteria.",
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
    title: "Estadísticas",
    href: "/estadisticas",
    icon: ChartColumn,
    description: "Ventas por día, caja y resumen del negocio.",
  },
  {
    title: "Presupuestos guardados",
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
