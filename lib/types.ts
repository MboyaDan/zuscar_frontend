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
