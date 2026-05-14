import {
  ClipboardList,
  Home,
  PackageSearch,
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
    description: "Vender desde mostrador",
  },
  {
    title: "Caja",
    href: "/caja",
    icon: WalletCards,
    description: "Abrir y cerrar caja diaria",
  },
  {
    title: "Ajustes",
    href: "/ajustes",
    icon: Settings,
    description: "Administrar la ferreteria",
  },
] as const;

export const adminItems = [
  {
    title: "Productos",
    href: "/productos",
    icon: PackageSearch,
    description: "Editar productos, fotos, stock e historial",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Administrar clientes y cuenta corriente",
  },
  {
    title: "Ventas / Historial",
    href: "/ventas",
    icon: ShoppingCart,
    description: "Ver ventas realizadas e imprimir comprobantes",
  },
  {
    title: "Presupuestos",
    href: "/presupuestos",
    icon: ClipboardList,
    description: "Ver presupuestos guardados",
  },
  {
    title: "Configuración",
    href: "/configuracion",
    icon: Settings,
    description: "Datos de la ferreteria y preferencias",
  },
] as const;
