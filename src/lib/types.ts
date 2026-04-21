/** Shared types for the QuarterTime app. */

export type UnavailableRange = {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  label?: string | null;
};

export type Member = {
  id: string;
  name: string;
  unavailable_ranges: UnavailableRange[];
  activities: string[];
  raw_transcript: string | null;
  created_at: string;
  updated_at: string;
};

export type AiSummary = {
  summary: string | null;
  top_recommendation: string | null;
  unique_pick: string | null;
  member_count: number;
  updated_at: string;
};
