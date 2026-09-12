import { timingSafeEqual } from "node:crypto";
import { env } from "@/src/config/env";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminRequest(request: Request) {
  if (!env.adminApiToken) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7), env.adminApiToken);
}
