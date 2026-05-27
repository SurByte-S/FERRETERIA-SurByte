import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerEnv } from "./env";

let serverClient: SupabaseClient | null = null;

export class SupabaseServerConfigError extends Error {
  constructor(missing: string[]) {
    super(`Faltan variables de Supabase servidor: ${missing.join(", ")}.`);
    this.name = "SupabaseServerConfigError";
  }
}

export function getSupabaseServerClient(source = "getSupabaseServerClient") {
  const env = getSupabaseServerEnv(source);

  if (!env.ok) {
    throw new SupabaseServerConfigError(env.missing);
  }

  if (!serverClient) {
    serverClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}
