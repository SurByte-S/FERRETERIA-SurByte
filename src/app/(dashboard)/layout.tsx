import { connection } from "next/server";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireUser();

  return <DashboardShell userEmail={user.email}>{children}</DashboardShell>;
}
