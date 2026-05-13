"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { loginAction, type LoginActionState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: LoginActionState = {
  ok: false,
  message: "",
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <label className="grid gap-2 text-base font-semibold">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-14 rounded-lg border border-input bg-background px-4 text-lg"
        />
      </label>

      <label className="grid gap-2 text-base font-semibold">
        <span>Contrasena</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-14 rounded-lg border border-input bg-background px-4 text-lg"
        />
      </label>

      {state.message ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-base font-semibold">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-14 gap-2 text-lg">
        <LogIn className="size-6" aria-hidden="true" />
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}

