declare global {
  namespace Express {
    interface Request {
      userId: string;
      vaultId?: string;
    }
  }
}
export {};
