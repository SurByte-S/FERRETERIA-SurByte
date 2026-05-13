"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { setAuthCookies } from "@/lib/auth/session";

export type LoginActionState = {
  ok: boolean;
  message: string;
};

function getSupabaseLoginClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
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
  } catch {
    return {
      ok: false,
      message: "No se pudo ingresar. Revisa la conexion.",
    };
  }

  redirect("/inicio");
}

