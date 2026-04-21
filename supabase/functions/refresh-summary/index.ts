import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROUP_PASSWORD = Deno.env.get("GROUP_PASSWORD")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { password } = await req.json().catch(() => ({}));
    if (password !== GROUP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: members, error } = await supabase
      .from("members")
      .select("name, activities");
    if (error) throw error;

    if (!members || members.length === 0) {
      await supabase.from("ai_summary_cache").update({
        summary: null, top_recommendation: null, unique_pick: null,
        member_count: 0, updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, empty: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const submissions = members.map((m: any) => `- ${m.name}: ${(m.activities || []).join(", ") || "(none mentioned)"}`).join("\n");

    const tools = [{
      type: "function",
      function: {
        name: "report",
        description: "Report the group activity analysis.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2-3 sentence warm summary of what the group collectively wants to do." },
            top_recommendation: { type: "string", description: "Single best activity with brief rationale (e.g. 'Outdoor hikes — mentioned by 4 of 5 friends')." },
            unique_pick: { type: "string", description: "The most distinctive single suggestion with who proposed it (e.g. 'Wildcard: pottery night — suggested by Jordan')." },
          },
          required: ["summary", "top_recommendation", "unique_pick"],
          additionalProperties: false,
        },
      },
    }];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You analyze a small friend group's activity wishes and produce a warm, concise group report. Group similar/synonymous activities together when counting volume." },
          { role: "user", content: `Friends and what they want to do:\n${submissions}\n\nProduce the report.` },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "report" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI summary error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI summary failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No structured report" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);

    await supabase.from("ai_summary_cache").update({
      summary: args.summary,
      top_recommendation: args.top_recommendation,
      unique_pick: args.unique_pick,
      member_count: members.length,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-summary error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
