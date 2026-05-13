"use server";

import { redirect } from "next/navigation";

import { clearAuthCookies } from "@/lib/auth/session";

export async function logoutAction() {
  await clearAuthCookies();
  redirect("/login");
}

