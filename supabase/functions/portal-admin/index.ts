import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Aanmelding vereist." }, 401);

  const { data: allowed } = await admin.from("portal_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!allowed) return json({ error: "Alleen plannerbeheerders mogen klanttoegang beheren." }, 403);

  try {
    const body = await req.json();
    if (body.action !== "invite") return json({ error: "Onbekende actie." }, 400);
    const customerId = String(body.customer_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const contactName = String(body.contact_name || "").trim();
    if (!customerId || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Klant en geldig e-mailadres zijn verplicht." }, 400);

    const { data: customer } = await admin.from("portal_customers").select("customer_id").eq("customer_id", customerId).eq("active", true).maybeSingle();
    if (!customer) return json({ error: "Klant is niet beschikbaar voor het portaal." }, 404);

    let account = null;
    for (let page = 1; page <= 10 && !account; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      account = data.users.find((u) => u.email?.toLowerCase() === email) || null;
      if (data.users.length < 100) break;
    }
    let invited = false;
    if (!account) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://ralabasterplanner.vercel.app/portal",
        data: { portal_customer_id: customerId, contact_name: contactName },
      });
      if (error) throw error;
      account = data.user;
      invited = true;
    }
    if (!account) throw new Error("Klantaccount kon niet worden gemaakt.");

    const { error: linkError } = await admin.from("portal_customer_users").upsert({
      user_id: account.id,
      customer_id: customerId,
      email,
      contact_name: contactName || null,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (linkError) throw linkError;
    return json({ ok: true, invited, email, user_id: account.id });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Portaaltoegang kon niet worden opgeslagen." }, 400);
  }
});
