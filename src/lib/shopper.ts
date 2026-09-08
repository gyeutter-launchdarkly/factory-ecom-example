import { randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';
export const SHOPPER_COOKIE = 'factory-shopper';
/** The same anonymous context evaluates flags and records conversion. */
export function shopperKey(request?: Request): string {
  const value = request?.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SHOPPER_COOKIE}=`))
    ?.slice(SHOPPER_COOKIE.length + 1);
  return value && /^[a-zA-Z0-9-]{16,64}$/.test(value) ? value : randomUUID();
}
export function withShopper(response: NextResponse, key: string): NextResponse {
  response.cookies.set(SHOPPER_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400 * 30,
  });
  return response;
}
