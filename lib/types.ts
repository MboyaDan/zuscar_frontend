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
