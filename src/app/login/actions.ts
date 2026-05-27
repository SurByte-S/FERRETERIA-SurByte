"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { setAuthCookies } from "@/lib/auth/session";
import { logServerWarn } from "@/lib/server-log";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

export type LoginActionState = {
  ok: boolean;
  message: string;
};

function getSupabaseLoginClient() {
  const env = getSupabaseBrowserEnv("loginAction");

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

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      ok: false,
      message: "Ingresa email y contrasena.",
    };
  }

  try {
    const supabase = getSupabaseLoginClient();

    if (!supabase) {
      return {
        ok: false,
        message: "No se pudo ingresar. Revisa la configuracion.",
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      logServerWarn("Login rejected by Supabase", {
        source: "loginAction",
        error: error?.message,
      });
      return {
        ok: false,
        message: "No se pudo ingresar. Revisa email y contrasena.",
      };
    }

    await setAuthCookies({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    });
  } catch (error) {
    logServerWarn("Login action failed", {
      source: "loginAction",
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message: "No se pudo ingresar. Revisa la conexion.",
    };
  }

  redirect("/inicio");
}

