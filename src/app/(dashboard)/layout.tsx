import { connection } from "next/server";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireUser } from "@/lib/auth/session";
import { requireTenant } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireUser();
  await requireTenant();

  return <DashboardShell userEmail={user.email}>{children}</DashboardShell>;
}
