# Ferreteria SaaS

Base multi-tenant para administrar ferreterias con Next.js App Router, TypeScript, Supabase, Tailwind y shadcn/ui.

## Correr localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`.

## Variables

Completar `.env.local` con las claves del proyecto Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_DEFAULT_TENANT_ID`
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
- `NEXT_PUBLIC_DEFAULT_TENANT_NAME`

## Estructura

- `src/app/(dashboard)`: rutas principales del panel.
- `src/components/shell`: layout, navegacion y estados base.
- `src/components/productos`: componentes del modulo productos.
- `src/components/presupuestos`: componentes del modulo presupuestos.
- `src/lib/supabase`: clientes Supabase con inicializacion lazy.
- `src/lib/tenant`: helpers para resolver tenant actual.
