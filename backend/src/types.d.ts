declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
      vaultId?: string;
    }
  }
}
export {};
