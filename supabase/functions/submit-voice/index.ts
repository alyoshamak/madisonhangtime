import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROUP_PASSWORD = Deno.env.get("GROUP_PASSWORD")!;

const today = new Date();
const sixMonthsOut = new Date(today);
sixMonthsOut.setMonth(today.getMonth() + 6);

const fmt = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { password, audioBase64, mimeType, claimMemberId } = await req.json();

    if (password !== GROUP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If this is an update for a known member, load their current record so the AI can do partial updates.
    let existingMember:
      | { id: string; name: string; unavailable_ranges: any; activities: any }
      | null = null;
    if (claimMemberId) {
      const { data } = await supabase
        .from("members")
        .select("id, name, unavailable_ranges, activities")
        .eq("id", claimMemberId)
        .maybeSingle();
      if (data) existingMember = data as any;
    }

    const isUpdate = !!existingMember;

    const systemPrompt = isUpdate
      ? `You are updating an existing friend's scheduling record from a short voice note.
Today is ${fmt(today)}. Planning window runs through ${fmt(sixMonthsOut)} (~6 months).

The existing record is:
- name: "${existingMember!.name}"
- unavailable_ranges: ${JSON.stringify(existingMember!.unavailable_ranges)}
- activities: ${JSON.stringify(existingMember!.activities)}

The speaker is THIS SAME PERSON updating their own info. They may:
- Correct the spelling/form of their name (e.g. "my name is actually spelled Madyson, not Madison"). If so, set name_update to the corrected name.
- Add, remove, or change unavailable date ranges. If they mention any unavailable dates, set unavailable_ranges_update to the COMPLETE new list (replacing the old list). If they don't mention dates at all, leave unavailable_ranges_update null.
- Change activity preferences. If they mention activities, set activities_update to the COMPLETE new list. If they don't mention activities, leave activities_update null.

Only set the fields the speaker actually addressed — leave the rest null so existing data is preserved.
Convert relative dates ("next weekend", "Christmas week", "all of August") to concrete YYYY-MM-DD start/end within the window.
Always call the record_update tool exactly once.`
      : `You extract scheduling info from a friend's voice note.
Today is ${fmt(today)}. The planning window runs through ${fmt(sixMonthsOut)} (~6 months).
The speaker will state: their name, stretches of days they are NOT available within this 6-month window, and activities they would enjoy doing with friends.
Convert any relative dates (e.g. "next weekend", "the second week of June", "Christmas week", "all of August") into concrete YYYY-MM-DD start/end dates within the window. If a year isn't given, infer the nearest future occurrence within the window.
Each unavailable range must have inclusive start_date and end_date. Single days have start_date == end_date.
Activities should be short noun phrases (e.g. "outdoor hikes", "pottery night", "concerts").
Always call the record_response tool exactly once.`;

    const rangeItemSchema = {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        label: { type: "string", description: "Optional human description like 'vacation' or 'work travel'." },
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    };

    const tools = isUpdate
      ? [
          {
            type: "function",
            function: {
              name: "record_update",
              description: "Apply a partial update to the existing member record. Leave fields null when the speaker did not address them.",
              parameters: {
                type: "object",
                properties: {
                  name_update: {
                    type: ["string", "null"],
                    description: "New/corrected name if the speaker asked to fix or change it. Otherwise null.",
                  },
                  unavailable_ranges_update: {
                    type: ["array", "null"],
                    items: rangeItemSchema,
                    description: "Complete new list of unavailable ranges if the speaker discussed dates. Null if dates not mentioned.",
                  },
                  activities_update: {
                    type: ["array", "null"],
                    items: { type: "string" },
                    description: "Complete new list of activities if the speaker discussed them. Null if activities not mentioned.",
                  },
                  transcript: { type: "string", description: "Verbatim transcript of what they said." },
                },
                required: ["transcript"],
                additionalProperties: false,
              },
            },
          },
        ]
      : [
          {
            type: "function",
            function: {
              name: "record_response",
              description: "Record the parsed response from the friend.",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Speaker's first name (or how they introduced themselves)." },
                  unavailable_ranges: {
                    type: "array",
                    items: rangeItemSchema,
                  },
                  activities: {
                    type: "array",
                    items: { type: "string" },
                    description: "Short list of activities/interests mentioned.",
                  },
                  transcript: { type: "string", description: "Verbatim transcript of what they said." },
                },
                required: ["name", "unavailable_ranges", "activities", "transcript"],
                additionalProperties: false,
              },
            },
          },
        ];

    const toolName = isUpdate ? "record_update" : "record_response";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: isUpdate ? "Here is the update voice note. Apply only what they actually said." : "Here is the voice note. Extract the structured response." },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: mimeType?.includes("wav") ? "wav" : "mp3",
                },
              },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit hit, please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "Could not understand the recording. Try again." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);

    // ---------- UPDATE PATH (existing identified member) ----------
    if (isUpdate) {
      const patch: any = { updated_at: new Date().toISOString() };
      if (args.transcript) patch.raw_transcript = args.transcript;

      if (typeof args.name_update === "string" && args.name_update.trim()) {
        patch.name = args.name_update.trim();
      }
      if (Array.isArray(args.unavailable_ranges_update)) {
        patch.unavailable_ranges = args.unavailable_ranges_update
          .map((r: any) => (r?.start_date && r?.end_date ? { start_date: r.start_date, end_date: r.end_date, label: r.label ?? null } : null))
          .filter(Boolean);
      }
      if (Array.isArray(args.activities_update)) {
        patch.activities = args.activities_update.map((a: string) => String(a).trim()).filter(Boolean);
      }

      const { error } = await supabase.from("members").update(patch).eq("id", existingMember!.id);
      if (error) {
        console.error("Update failed", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Refresh summary in background
      (async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/refresh-summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ password: GROUP_PASSWORD }),
          });
        } catch (e) { console.error("summary refresh failed", e); }
      })();

      const finalName = patch.name ?? existingMember!.name;
      return new Response(JSON.stringify({
        ok: true,
        memberId: existingMember!.id,
        name: finalName,
        updated_fields: {
          name: !!patch.name,
          unavailable_ranges: !!patch.unavailable_ranges,
          activities: !!patch.activities,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- NEW SUBMISSION PATH ----------
    const name = (args.name ?? "").trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "Couldn't catch a name in the recording." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ranges = (args.unavailable_ranges ?? [])
      .map((r: any) => (r?.start_date && r?.end_date ? { start_date: r.start_date, end_date: r.end_date, label: r.label ?? null } : null))
      .filter(Boolean);
    const activities = (args.activities ?? []).map((a: string) => String(a).trim()).filter(Boolean);

    const payload: any = {
      name,
      unavailable_ranges: ranges,
      activities,
      raw_transcript: args.transcript ?? null,
      updated_at: new Date().toISOString(),
    };

    let memberId: string | undefined;

    // Upsert by case-insensitive name
    const { data: existing } = await supabase
      .from("members")
      .select("id")
      .ilike("name", name)
      .maybeSingle();

    if (existing?.id) {
      memberId = existing.id;
      const { error } = await supabase.from("members").update(payload).eq("id", memberId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data, error } = await supabase
        .from("members")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      memberId = data.id;
    }

    // Fire-and-forget: refresh AI summary
    (async () => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/refresh-summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ password: GROUP_PASSWORD }),
        });
      } catch (e) { console.error("summary refresh failed", e); }
    })();

    return new Response(JSON.stringify({
      ok: true,
      memberId,
      name,
      unavailable_ranges: ranges,
      activities,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("submit-voice error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
