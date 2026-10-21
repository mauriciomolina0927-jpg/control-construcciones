export type Role = "admin" | "partner" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  partner: "Socio operativo",
  viewer: "Socio en consulta",
};
