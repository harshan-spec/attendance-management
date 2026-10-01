import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=verification", request.url), { headers: { "Cache-Control": "private, no-store" } });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=verification", request.url), { headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.redirect(new URL("/dashboard", request.url), { headers: { "Cache-Control": "private, no-store" } });
}
