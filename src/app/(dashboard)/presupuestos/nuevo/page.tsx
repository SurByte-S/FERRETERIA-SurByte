import { redirect } from "next/navigation";

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;
  const params = new URLSearchParams();

  if (sku) {
    params.set("sku", sku);
  }

  redirect(params.size > 0 ? `/inicio?${params.toString()}` : "/inicio");
}
