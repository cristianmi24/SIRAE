import type { AuthContext } from "../services/auth-context.js";
declare global { namespace Express { interface Request { auth?: AuthContext } } }
export {};
