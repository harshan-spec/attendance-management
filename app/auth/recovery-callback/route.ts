import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/forgot-password?error=verification", request.url), { headers: { "Cache-Control": "private, no-store" } });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/forgot-password?error=verification", request.url), { headers: { "Cache-Control": "private, no-store" } });

  const cookieStore = await cookies();
  cookieStore.set("attendly-password-recovery", "verified", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(new URL("/update-password", request.url), { headers: { "Cache-Control": "private, no-store" } });
}
