import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import {
  logServerAuthInfo,
  logServerInfo,
  logServerWarn,
} from "@/lib/server-log";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

const ACCESS_TOKEN_COOKIE = "ferreteria_sb_access_token";
const REFRESH_TOKEN_COOKIE = "ferreteria_sb_refresh_token";

type AuthUser = {
  id: string;
  email?: string;
};

function getSupabaseAuthClient(source: string) {
  const env = getSupabaseBrowserEnv(source);

  if (!env.ok) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setAuthCookies({
  accessToken,
  refreshToken,
  expiresIn,
}: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const cookieStore = await cookies();

  cookieStore.set(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    cookieOptions(Math.max(expiresIn, 60))
  );
  cookieStore.set(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    cookieOptions(60 * 60 * 24 * 30)
  );
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();

  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getCurrentUser(
  source = "getCurrentUser"
): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    logServerInfo("Auth cookie not found", { source });
    return null;
  }

  const supabase = getSupabaseAuthClient(source);

  if (!supabase) {
    logServerWarn("Auth client unavailable", { source });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    logServerWarn("Authenticated user not found", {
      source,
      error: error?.message,
    });
    return null;
  }

  logServerAuthInfo("Authenticated user found", {
    source,
    userId: data.user.id,
    hasEmail: Boolean(data.user.email),
  });

  return {
    id: data.user.id,
    email: data.user.email,
  };
}

export async function requireUser(source = "requireUser"): Promise<AuthUser> {
  const user = await getCurrentUser(source);

  if (!user) {
    logServerWarn("Redirecting unauthenticated request to login", { source });
    redirect("/login");
  }

  return user;
}

