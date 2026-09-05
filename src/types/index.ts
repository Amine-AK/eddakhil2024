import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  teacherId: string | null;
};

export { Role };
