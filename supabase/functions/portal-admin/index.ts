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
    const action = String(body.action || "");
    if (["block", "activate", "remove"].includes(action)) {
      const userId = String(body.user_id || "").trim();
      if (!userId) return json({ error: "Gebruiker ontbreekt." }, 400);
      const { data: member, error: memberError } = await admin.from("portal_customer_users").select("user_id,email").eq("user_id", userId).maybeSingle();
      if (memberError) throw memberError;
      if (!member) return json({ error: "Klantgebruiker niet gevonden." }, 404);
      if (action === "remove") {
        // Preserve orders and requests; remove the portal membership only.
        const { error: deleteError } = await admin.from("portal_customer_users").delete().eq("user_id", userId);
        if (deleteError) throw deleteError;
        const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
        if (banError) throw banError;
        return json({ ok: true, action, email: member.email });
      }
      const active = action === "activate";
      const { error: updateError } = await admin.from("portal_customer_users").update({ active, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (updateError) throw updateError;
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
      if (authError) throw authError;
      return json({ ok: true, action, active, email: member.email });
    }
    if (!["invite", "prepare_invitation"].includes(action)) return json({ error: "Onbekende actie." }, 400);
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
    const draftOnly = action === "prepare_invitation";
    const language = String(body.language || "nl");
    if (draftOnly && !["nl", "en", "de"].includes(language)) return json({ error: "Ongeldige taal." }, 400);
    if (draftOnly && account) {
      const { data: membership, error } = await admin.from("portal_customer_users").select("customer_id,active").eq("user_id", account.id).maybeSingle();
      if (error) throw error;
      if (membership && membership.customer_id !== customerId) return json({ error: "Dit e-mailadres hoort al bij een andere klant. Controleer de klantkoppeling." }, 409);
      if (membership && !membership.active) return json({ error: "Dit account is geblokkeerd. Activeer het eerst via Klantportaal." }, 409);
      const { data: staff } = await admin.from("portal_admins").select("user_id").eq("user_id", account.id).maybeSingle();
      if (staff) return json({ error: "Een plannerbeheerder kan niet als klant worden uitgenodigd." }, 409);
    }
    let invited = false;
    if (draftOnly && !account) {
      // Provision access without sending mail. The customer's reset email proves mailbox ownership.
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { contact_name: contactName } });
      if (error) throw error;
      account = data.user;
    }
    if (!account) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://ralabasterplanner.vercel.app/portal?mode=password",
        data: { portal_customer_id: customerId, contact_name: contactName },
      });
      if (error) throw error;
      account = data.user;
      invited = true;
    }
    if (!account) throw new Error("Klantaccount kon niet worden gemaakt.");

    if (!draftOnly) {
    const { error: unbanError } = await admin.auth.admin.updateUserById(account.id, { ban_duration: "none" });
    if (unbanError) throw unbanError;
    }

    const { error: linkError } = await admin.from("portal_customer_users").upsert({
      user_id: account.id,
      customer_id: customerId,
      email,
      contact_name: contactName || null,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (linkError) throw linkError;
    if (draftOnly) {
      const { error } = await admin.from("portal_customers").update({ preferred_language: language, updated_at: new Date().toISOString() }).eq("customer_id", customerId);
      if (error) throw error;
    }
    return json({ ok: true, invited, draft_only: draftOnly, email, user_id: account.id });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Portaaltoegang kon niet worden opgeslagen." }, 400);
  }
});
