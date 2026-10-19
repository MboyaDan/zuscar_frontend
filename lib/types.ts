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

// ---- Orders and the POS (Stage 13) ----

export type DiningTable = { id: number; label: string; seats: number; active: boolean; open_order_id: number | null };

export type OrderStatus = "open" | "sent" | "finalised" | "cancelled";

export type OrderSummary = {
  id: number;
  order_no: number;
  order_type: "dine_in" | "takeaway";
  table_id: number | null;
  table_label: string;
  status: OrderStatus;
  opened_by: number;
  opened_by_name: string;
  note: string;
  version: number;
  cancel_reason: string;
  subtotal_cents: number;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type OrderLine = {
  id: number;
  product_id: number;
  name: string;
  kitchen_routed: boolean;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  status: "active" | "cancelled";
  note: string;
  cancel_reason: string;
  sent_to_kitchen: boolean;
  modifiers: { id: number; name: string; price_delta_cents: number }[];
};

export type Order = OrderSummary & { items: OrderLine[] };

export type MenuModifier = { id: number; name: string; price_delta_cents: number };
export type MenuProduct = { id: number; name: string; price_cents: number; kitchen_routed: boolean; modifiers: MenuModifier[] };
export type MenuCategory = { id: number; module: Module; name: string; sort_order: number; products: MenuProduct[] };

export type KitchenTicket = {
  id: number;
  order_id: number;
  order_no: number;
  order_type: "dine_in" | "takeaway";
  table_label: string;
  business_date: string;
  ticket_no: number;
  kind: "original" | "update";
  parent_ticket_id: number | null;
  status: "submitted" | "preparing" | "ready" | "served" | "cancelled";
  created_by_name: string;
  created_at: string;
  updated_at: string;
  lines: { order_item_id: number; name: string; qty: number; change_type: "add" | "cancel" | "modify"; modifiers: string; note: string }[];
};

// ---- Sales and payments (Stage 13b) ----

export type PaymentMethod = "cash" | "mpesa_manual" | "card_manual" | "bank_manual";
export type PaymentStatus = "pending_confirmation" | "confirmed" | "failed" | "reversed";

export type BillLine = {
  order_item_id: number;
  name: string;
  qty: number;
  unit_price_cents: number;
  modifiers_text: string;
  modifiers_cents: number;
  tax_rate_bp: number;
  tax_cents: number;
  line_total_cents: number;
};

export type Bill = { order_id: number; order_no: number; lines: BillLine[]; total_cents: number; tax_cents: number; tax_inclusive: boolean; tax_status: "provisional_unverified" | "verified" };

export type SalePayment = {
  id: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  reference?: string;
  created_by: number;
  created_at: string;
  confirmed_at: string | null;
};

export type SaleItem = {
  id: number;
  name: string;
  qty: number;
  unit_price_cents: number;
  modifiers_text: string;
  modifiers_cents: number;
  discount_cents: number;
  discount_reason?: string;
  tax_cents: number;
  line_total_cents: number;
};

export type SaleRow = {
  id: number;
  receipt_no: number;
  order_id: number | null;
  order_no?: number;
  business_date: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  pending_cents: number;
  balance_cents: number;
  status: "finalised" | "partially_refunded" | "refunded" | "voided";
  payment_status: "unpaid" | "partially_paid" | "paid" | "charged_to_folio";
  cashier_name: string;
  shift_id?: number | null;
  tax_status?: "provisional_unverified" | "verified";
  created_at: string;
};

export type Sale = SaleRow & { items: SaleItem[]; payments: SalePayment[] };
