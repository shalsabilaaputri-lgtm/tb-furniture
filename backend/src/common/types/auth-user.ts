export type AuthUser = {
  sub: string;
  email: string;
  fullName: string;
  role: string;
  branchId: string | null;
  permissions: string[];
};
