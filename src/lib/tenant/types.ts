export type Tenant = {
  id: string;
  slug: string;
  name: string;
};

export type TenantRole = "owner" | "admin" | "seller" | "viewer";

export type AuthenticatedTenant = Tenant & {
  role: TenantRole;
};
