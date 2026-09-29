import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://attendance-management-beta-flax.vercel.app",
]);

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function defaultKey(name: string): string | null {
  const value = Deno.env.get(name);
  if (!value) return null;
  try {
    const keys = JSON.parse(value) as Record<string, unknown>;
    return typeof keys.default === "string" ? keys.default : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = responseHeaders(origin);
  if (origin && !allowedOrigins.has(origin)) {
    return Response.json({ error: "Origin is not allowed." }, { status: 403, headers });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !projectUrl || !publishableKey || !secretKey) {
    return Response.json({ error: "Account deletion is temporarily unavailable." }, { status: token ? 503 : 401, headers });
  }

  const userClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return Response.json({ error: "Sign in again before deleting your account." }, { status: 401, headers });

  const adminClient = createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id, false);
  if (deleteError) return Response.json({ error: "Your account could not be deleted." }, { status: 500, headers });

  return Response.json({ deleted: true }, { status: 200, headers });
});
