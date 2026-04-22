import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROUP_PASSWORD = Deno.env.get("GROUP_PASSWORD")!;

const DAY_MS = 24 * 60 * 60 * 1000;

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

const sanitize = (r: any): UnavailableRange | null => {
  if (!r?.start_date || !r?.end_date) return null;
  let s = parseDay(String(r.start_date));
  let e = parseDay(String(r.end_date));
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  if (e < s) [s, e] = [e, s];
  return {
    start_date: formatDay(s),
    end_date: formatDay(e),
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : null,
  };
};

const mergeRanges = (ranges: UnavailableRange[]) => {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => parseDay(a.start_date) - parseDay(b.start_date));
  const merged: UnavailableRange[] = [{ ...sorted[0] }];
  for (const next of sorted.slice(1)) {
    const cur = merged[merged.length - 1];
    const curEnd = parseDay(cur.end_date);
    const nxtStart = parseDay(next.start_date);
    const nxtEnd = parseDay(next.end_date);
    if (nxtStart <= curEnd + DAY_MS) {
      cur.end_date = formatDay(Math.max(curEnd, nxtEnd));
      cur.label = cur.label ?? next.label;
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
};

const containsDay = (ranges: UnavailableRange[], dayMs: number) =>
  ranges.some((r) => dayMs >= parseDay(r.start_date) && dayMs <= parseDay(r.end_date));

const removeDay = (ranges: UnavailableRange[], dayMs: number): UnavailableRange[] => {
  const out: UnavailableRange[] = [];
  for (const r of ranges) {
    const s = parseDay(r.start_date);
    const e = parseDay(r.end_date);
    if (dayMs < s || dayMs > e) {
      out.push(r);
      continue;
    }
    if (s < dayMs) out.push({ start_date: r.start_date, end_date: formatDay(dayMs - DAY_MS), label: r.label });
    if (dayMs < e) out.push({ start_date: formatDay(dayMs + DAY_MS), end_date: r.end_date, label: r.label });
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { password, member_id, date } = body || {};

    if (!password || password !== GROUP_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!member_id || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: member, error } = await supabase
      .from("members")
      .select("id, unavailable_ranges")
      .eq("id", member_id)
      .maybeSingle();

    if (error || !member) {
      return new Response(JSON.stringify({ error: "Member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existing = mergeRanges(
      (Array.isArray(member.unavailable_ranges) ? member.unavailable_ranges : [])
        .map(sanitize)
        .filter((r): r is UnavailableRange => !!r),
    );

    const dayMs = parseDay(date);
    const wasBusy = containsDay(existing, dayMs);
    const next = wasBusy
      ? removeDay(existing, dayMs)
      : mergeRanges([...existing, { start_date: date, end_date: date, label: null }]);

    const { error: upErr } = await supabase
      .from("members")
      .update({ unavailable_ranges: next, updated_at: new Date().toISOString() })
      .eq("id", member_id);

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget refresh of summary cache (don't await failures)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/refresh-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch (_) {
      // ignore
    }

    return new Response(
      JSON.stringify({ ok: true, now_unavailable: !wasBusy, unavailable_ranges: next }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
