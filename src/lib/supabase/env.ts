import { logServerError } from "@/lib/server-log";

type SupabaseBrowserEnv =
  | {
      ok: true;
      supabaseUrl: string;
      supabaseAnonKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

type SupabaseServerEnv =
  | {
      ok: true;
      supabaseUrl: string;
      supabaseServiceRoleKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

export function getSupabaseBrowserEnv(source: string): SupabaseBrowserEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    logServerError("Supabase browser env missing", { source, missing: missing.join(",") });
    return { ok: false, missing };
  }

  return {
    ok: true,
    supabaseUrl: supabaseUrl as string,
    supabaseAnonKey: supabaseAnonKey as string,
  };
}

export function getSupabaseServerEnv(source: string): SupabaseServerEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    logServerError("Supabase server env missing", { source, missing: missing.join(",") });
    return { ok: false, missing };
  }

  return {
    ok: true,
    supabaseUrl: supabaseUrl as string,
    supabaseServiceRoleKey: supabaseServiceRoleKey as string,
  };
}
