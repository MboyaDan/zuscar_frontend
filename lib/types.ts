// Shapes returned by the API (docs/api/openapi.yaml in the backend repository).

export type SessionUser = { id: number; username: string; display_name: string };

export type Me = {
  user: SessionUser;
  roles: string[];
  permissions: string[];
  must_change_password: boolean;
  auth_method: "password" | "pin";
  session: { idle_expires_at: string; absolute_expires_at: string; recently_reauthenticated: boolean };
};

export type LoginResult = {
  user: SessionUser;
  must_change_password: boolean;
  expires_at: string;
};

export type UserView = {
  id: number;
  username: string;
  display_name: string;
  status: "active" | "inactive";
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  deactivated_at: string | null;
  roles: string[];
};

export type UserList = { items: UserView[]; next_cursor: string };

export type AssignableRole = { code: string; name: string; description: string };

export type Role = {
  id: number;
  code: string;
  name: string;
  description: string;
  is_protected: boolean;
  is_template: boolean;
  permissions: string[];
  user_count: number;
};

export type PermissionItem = { id: number; key: string; description: string; is_protected: boolean };

export type AffectedUser = { id: number; username: string };

export type AuditEntry = {
  id: number;
  occurred_at: string;
  actor_user_id: number | null;
  actor_label: string;
  action: string;
  entity_type: string;
  entity_id: string;
  result: string;
  reason: string;
  ip: string;
  request_id: string;
  before: unknown;
  after: unknown;
};

export type AuditList = { items: AuditEntry[]; next_cursor: string };

export type TaxRate = { id: number; code: string; name: string; rate_bp: number; treatment: "standard" | "zero_rated" | "exempt"; active: boolean };

export type SettingsMap = Record<string, unknown>;

export type Module = "restaurant" | "bar";

export type Category = { id: number; module: Module; name: string; sort_order: number; active: boolean };

export type Modifier = { id: number; name: string; price_delta_cents: number; active: boolean };

export type Product = {
  id: number;
  category_id: number;
  category_name: string;
  module: Module;
  name: string;
  sku: string | null;
  price_cents: number;
  tax_rate: { id: number; code: string; name: string; rate_bp: number; treatment: TaxRate["treatment"] };
  is_available: boolean;
  kitchen_routed: boolean;
  modifier_ids: number[];
  created_at: string;
  updated_at: string;
};

export type PriceHistoryItem = { price_cents: number; effective_from: string; changed_by: number | null };

export type CatalogueData = { categories: Category[]; modifiers: Modifier[]; rates: TaxRate[]; products: Product[] };
