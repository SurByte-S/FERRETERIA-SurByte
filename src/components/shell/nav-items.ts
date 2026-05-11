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
    title: "Productos",
    href: "/productos",
    icon: PackageSearch,
    description: "Consultar y cargar articulos",
  },
  {
    title: "Presupuesto",
    href: "/presupuestos",
    icon: ClipboardList,
    description: "Armar presupuestos para clientes",
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
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Guardar datos de compradores",
  },
  {
    title: "Configuracion",
    href: "/configuracion",
    icon: Settings,
    description: "Ajustar datos de la ferreteria",
  },
] as const;

export const quickActions = [
  {
    title: "Nuevo presupuesto",
    href: "/presupuestos",
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
    title: "Registrar venta",
    href: "/ventas",
    icon: ShoppingCart,
    description: "Anotar una venta simple del dia.",
  },
  {
    title: "Abrir caja",
    href: "/caja",
    icon: WalletCards,
    description: "Controlar efectivo y cierre diario.",
  },
] as const;
