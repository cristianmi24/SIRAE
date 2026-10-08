export const membershipRoles = ["ADMIN", "DOCENTE"] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export type StudentStatus = "ACTIVO" | "INACTIVO";

export interface AuthUserDto {
  id: string;
  name: string;
  email?: string;
  role: MembershipRole | null;
  platformAdmin?: boolean;
  institution?: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface StudentDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  document: string;
  courseGroup?: {
    id: string;
    label: string;
  };
  email?: string;
  phone?: string;
  status: StudentStatus;
  qrVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}
