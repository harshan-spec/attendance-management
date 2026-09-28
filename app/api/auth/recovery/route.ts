import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured) return Response.json({ verified: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const cookieStore = await cookies();
  if (cookieStore.get("attendly-password-recovery")?.value !== "verified") {
    return Response.json({ verified: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return Response.json({ verified: Boolean(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set("attendly-password-recovery", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
}
