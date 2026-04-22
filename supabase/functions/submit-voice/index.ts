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
const DAY_MS = 24 * 60 * 60 * 1000;

const today = new Date();
const sixMonthsOut = new Date(today);
sixMonthsOut.setMonth(today.getMonth() + 6);

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const windowStart = fmt(today);
const windowEnd = fmt(sixMonthsOut);

type UnavailableRange = {
  start_date: string;
  end_date: string;
  label: string | null;
};

const parseDay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const formatDay = (value: number) => new Date(value).toISOString().slice(0, 10);

const sanitizeRange = (input: any): UnavailableRange | null => {
  if (!input?.start_date || !input?.end_date) return null;

  let start = parseDay(String(input.start_date));
  let end = parseDay(String(input.end_date));
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end < start) [start, end] = [end, start];

  const clampedStart = Math.max(start, parseDay(windowStart));
  const clampedEnd = Math.min(end, parseDay(windowEnd));
  if (clampedEnd < clampedStart) return null;

  return {
    start_date: formatDay(clampedStart),
    end_date: formatDay(clampedEnd),
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : null,
  };
};

const mergeRanges = (ranges: UnavailableRange[]) => {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => parseDay(a.start_date) - parseDay(b.start_date));
  const merged: UnavailableRange[] = [sorted[0]];

  for (const next of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    const currentEnd = parseDay(current.end_date);
    const nextStart = parseDay(next.start_date);
    const nextEnd = parseDay(next.end_date);

    if (nextStart <= currentEnd + DAY_MS) {
      current.end_date = formatDay(Math.max(currentEnd, nextEnd));
      current.label = current.label ?? next.label;
    } else {
      merged.push({ ...next });
    }
  }

  return merged;
};

const subtractRange = (source: UnavailableRange, removal: UnavailableRange) => {
  const sourceStart = parseDay(source.start_date);
  const sourceEnd = parseDay(source.end_date);
  const removalStart = parseDay(removal.start_date);
  const removalEnd = parseDay(removal.end_date);

  if (removalEnd < sourceStart || removalStart > sourceEnd) {
    return [source];
  }

  const result: UnavailableRange[] = [];

  if (removalStart > sourceStart) {
    result.push({
      start_date: formatDay(sourceStart),
      end_date: formatDay(removalStart - DAY_MS),
      label: source.label,
    });
  }

  if (removalEnd < sourceEnd) {
    result.push({
      start_date: formatDay(removalEnd + DAY_MS),
      end_date: formatDay(sourceEnd),
      label: source.label,
    });
  }

  return result;
};

const normalizeExistingRanges = (ranges: any) =>
  mergeRanges(
    (Array.isArray(ranges) ? ranges : [])
      .map((range) => sanitizeRange(range))
      .filter((range): range is UnavailableRange => !!range),
  );

const applyAvailabilityChanges = (existingRanges: any, changes: any[]) => {
  let next = normalizeExistingRanges(existingRanges);

  for (const change of Array.isArray(changes) ? changes : []) {
    const normalized = sanitizeRange(change);
    if (!normalized) continue;

    if (change.action === "remove_unavailable") {
      next = next.flatMap((range) => subtractRange(range, normalized));
      continue;
    }

    if (change.action === "add_unavailable") {
      next = mergeRanges([...next, normalized]);
    }
  }

  return mergeRanges(next);
};

const applyActivityChanges = (existingActivities: any, changes: any[]) => {
  const next = new Map<string, string>();

  for (const activity of Array.isArray(existingActivities) ? existingActivities : []) {
    const normalized = String(activity).trim();
    if (!normalized) continue;
    next.set(normalized.toLowerCase(), normalized);
  }

  for (const change of Array.isArray(changes) ? changes : []) {
    const activity = String(change?.activity ?? "").trim();
    if (!activity) continue;

    if (change.action === "remove") {
      next.delete(activity.toLowerCase());
      continue;
    }

    if (change.action === "add") {
      next.set(activity.toLowerCase(), activity);
    }
  }

  return [...next.values()];
};

type ExistingMemberLite = {
  id: string;
  name: string;
  unavailable_ranges: any;
  activities: any;
};

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const levenshtein = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
      prev[j] = curr;
    }
  }
  return prev[b.length];
};

const findLocalNameMatch = (spokenName: string, members: ExistingMemberLite[]) => {
  const target = normalizeName(spokenName);
  if (!target) return null;
  const targetFirst = target.split(" ")[0];

  for (const m of members) {
    const candidate = normalizeName(m.name);
    if (!candidate) continue;
    if (candidate === target) return m;
    const candidateFirst = candidate.split(" ")[0];
    if (candidateFirst && candidateFirst === targetFirst) return m;
  }

  // Fuzzy: small edit distance on first-name token (handles Madison/Madyson, Jen/Jenn).
  let best: { member: ExistingMemberLite; distance: number } | null = null;
  for (const m of members) {
    const candidateFirst = normalizeName(m.name).split(" ")[0];
    if (!candidateFirst) continue;
    const dist = levenshtein(candidateFirst, targetFirst);
    const maxLen = Math.max(candidateFirst.length, targetFirst.length);
    const threshold = maxLen <= 4 ? 1 : 2;
    if (dist <= threshold && (!best || dist < best.distance)) {
      best = { member: m, distance: dist };
    }
  }
  return best?.member ?? null;
};

const findMatchingMember = async (
  spokenName: string,
  members: ExistingMemberLite[],
): Promise<ExistingMemberLite | null> => {
  if (!members.length) return null;

  const local = findLocalNameMatch(spokenName, members);
  if (local) return local;

  // AI fallback: ask the model whether the spoken name refers to any existing person
  // (handles nicknames like "Maddie" -> "Madison").
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You decide whether a spoken name refers to one of the existing people in a small group of close friends. Match obvious nicknames and spelling variants (e.g. Maddie/Madison, Jen/Jennifer, Bobby/Robert). If unsure, say no match.",
          },
          {
            role: "user",
            content: `Spoken name: ${JSON.stringify(spokenName)}\nExisting people:\n${members
              .map((m) => `- id=${m.id} name=${JSON.stringify(m.name)}`)
              .join("\n")}\n\nReturn JSON: {"match_id": "<id or null>"}.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const matchId = parsed?.match_id;
    if (!matchId || matchId === "null") return null;
    return members.find((m) => m.id === matchId) ?? null;
  } catch (e) {
    console.error("AI name match failed", e);
    return null;
  }
};

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
Today is ${windowStart}. The planning window runs through ${windowEnd}.

Current record:
- name: ${JSON.stringify(existingMember!.name)}
- unavailable_ranges: ${JSON.stringify(existingMember!.unavailable_ranges)}
- activities: ${JSON.stringify(existingMember!.activities)}

This speaker is the SAME person. Keep their existing name unless they explicitly correct the spelling or format of their name.
Do not replace their whole record. Preserve all existing data unless the speaker explicitly changes it.

For availability:
- If they say they are busy, unavailable, away, traveling, or cannot make a date range, return an availability_changes item with action "add_unavailable".
- If they say they are now free, available, can make a date that was previously blocked, or want to remove a prior conflict, return an item with action "remove_unavailable".
- Only include the date ranges they explicitly changed in this update.

For activities:
- If they add a new preference, use action "add".
- If they say they no longer want an activity, use action "remove".
- Only include activity changes they explicitly said.

Convert relative dates into concrete YYYY-MM-DD ranges inside the planning window.
Always call the record_update tool exactly once.`
      : `You extract scheduling info from a friend's voice note.
Today is ${windowStart}. The planning window runs through ${windowEnd} (~6 months).
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
              description: "Patch the existing member record while preserving any fields the speaker did not change.",
              parameters: {
                type: "object",
                properties: {
                  name_update: {
                    type: "string",
                    description: "Corrected name only if the speaker explicitly changed it. Otherwise return an empty string.",
                  },
                  availability_changes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: {
                          type: "string",
                          enum: ["add_unavailable", "remove_unavailable"],
                        },
                        start_date: { type: "string", description: "YYYY-MM-DD" },
                        end_date: { type: "string", description: "YYYY-MM-DD" },
                        label: { type: "string", description: "Optional context like vacation or work trip." },
                      },
                      required: ["action", "start_date", "end_date"],
                      additionalProperties: false,
                    },
                    description: "Only the unavailable/available date ranges the speaker changed in this update.",
                  },
                  activity_changes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", enum: ["add", "remove"] },
                        activity: { type: "string" },
                      },
                      required: ["action", "activity"],
                      additionalProperties: false,
                    },
                    description: "Only the activity preference changes explicitly requested in this update.",
                  },
                  transcript: { type: "string", description: "Verbatim transcript of what they said." },
                },
                required: ["name_update", "availability_changes", "activity_changes", "transcript"],
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

    const callAi = async (sysPrompt: string, aiTools: unknown, forcedToolName: string, userText: string) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sysPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
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
          tools: aiTools,
          tool_choice: { type: "function", function: { name: forcedToolName } },
        }),
      });
    };

    const aiResp = await callAi(
      systemPrompt,
      tools,
      toolName,
      isUpdate
        ? "Here is the update voice note. Only change the parts of the record the speaker explicitly changed."
        : "Here is the voice note. Extract the structured response.",
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit hit, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "Could not understand the recording. Try again." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);

    if (isUpdate) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        raw_transcript: args.transcript ?? null,
      };

      const nextName = String(args.name_update ?? "").trim();
      if (nextName) {
        patch.name = nextName;
      }

      const availabilityChanges = Array.isArray(args.availability_changes) ? args.availability_changes : [];
      if (availabilityChanges.length > 0) {
        patch.unavailable_ranges = applyAvailabilityChanges(existingMember!.unavailable_ranges, availabilityChanges);
      }

      const activityChanges = Array.isArray(args.activity_changes) ? args.activity_changes : [];
      if (activityChanges.length > 0) {
        patch.activities = applyActivityChanges(existingMember!.activities, activityChanges);
      }

      const { error } = await supabase.from("members").update(patch).eq("id", existingMember!.id);
      if (error) {
        console.error("Update failed", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      (async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/refresh-summary`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ password: GROUP_PASSWORD }),
          });
        } catch (e) {
          console.error("summary refresh failed", e);
        }
      })();

      return new Response(
        JSON.stringify({
          ok: true,
          memberId: existingMember!.id,
          name: (patch.name as string | undefined) ?? existingMember!.name,
          updated_fields: {
            name: !!patch.name,
            unavailable_ranges: Object.prototype.hasOwnProperty.call(patch, "unavailable_ranges"),
            activities: Object.prototype.hasOwnProperty.call(patch, "activities"),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const name = String(args.name ?? "").trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "Couldn't catch a name in the recording." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ranges = mergeRanges(
      (Array.isArray(args.unavailable_ranges) ? args.unavailable_ranges : [])
        .map((range) => sanitizeRange(range))
        .filter((range): range is UnavailableRange => !!range),
    );
    const activities = (Array.isArray(args.activities) ? args.activities : [])
      .map((activity: string) => String(activity).trim())
      .filter(Boolean);

    // Load all existing members so we can match against spelling variations / nicknames
    // and never create a duplicate row for the same person.
    const { data: allMembers } = await supabase
      .from("members")
      .select("id, name, unavailable_ranges, activities");

    const matchedMember = await findMatchingMember(name, allMembers ?? []);

    let memberId: string | undefined;
    let finalName = name;

    if (matchedMember) {
      // Treat as an update to the existing person — preserve prior data, keep their stored name.
      memberId = matchedMember.id;
      finalName = matchedMember.name;
      const mergedUnavailable = mergeRanges([
        ...normalizeExistingRanges(matchedMember.unavailable_ranges),
        ...ranges,
      ]);
      const mergedActivities = applyActivityChanges(
        matchedMember.activities,
        activities.map((activity) => ({ action: "add", activity })),
      );
      const updatePayload = {
        unavailable_ranges: mergedUnavailable,
        activities: mergedActivities,
        raw_transcript: args.transcript ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("members").update(updatePayload).eq("id", memberId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const insertPayload = {
        name,
        unavailable_ranges: ranges,
        activities,
        raw_transcript: args.transcript ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("members").insert(insertPayload).select("id").single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      memberId = data.id;
    }

    (async () => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/refresh-summary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ password: GROUP_PASSWORD }),
        });
      } catch (e) {
        console.error("summary refresh failed", e);
      }
    })();

    return new Response(
      JSON.stringify({
        ok: true,
        memberId,
        name: finalName,
        merged_with_existing: !!matchedMember,
        unavailable_ranges: ranges,
        activities,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("submit-voice error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
