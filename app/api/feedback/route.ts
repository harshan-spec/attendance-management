import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("Invalid request origin.", 403);
  if (!isSupabaseConfigured) return fail("Feedback is temporarily unavailable.", 503);
  const body = await request.text();
  if (body.length > 16000) return fail("Feedback is too long.", 413);
  let input;
  try { input = JSON.parse(body); } catch { return fail("Invalid feedback.", 400); }
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.id) ||
    !["bug", "suggestion", "other"].includes(input.category) || typeof input.message !== "string" || input.message.trim().length < 10 || input.message.trim().length > 3000) return fail("Please enter valid feedback between 10 and 3,000 characters.", 400);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Please sign in to send feedback.", 401);
  const { error } = await supabase.from("website_feedback").insert({ id: input.id, user_id: user.id, category: input.category, message: input.message.trim() });
  if (error) {
    if (error.code !== "23505") return fail("Couldn’t save your feedback. Please try again.", 503);
    const { data: existing } = await supabase.from("website_feedback").select("category,message").eq("id", input.id).eq("user_id", user.id).maybeSingle();
    if (!existing || existing.category !== input.category || existing.message !== input.message.trim()) return fail("Couldn’t save your feedback. Please try again.", 409);
  }
  return Response.json({ success: true }, { headers });
}
