
## QuarterTime — a coordination app for a small group of friends

A simple, voice-first web app where you and your friends record availability and activity preferences, then see overlap on a shared 6-month calendar.

---

### 1. Gate screen (shared password)
- Single full-screen card: "Enter the group password."
- One password protects entry to the whole app. Stored as a hashed value server-side; verified through an edge function so the secret never ships to the browser.
- After unlock, the device remembers the session locally so friends don't re-enter it each visit.

### 2. Voice onboarding (first visit)
- Big mic button center-screen with helper text:
  > "Tap and tell us: your name, the stretches of days you are NOT available over the next 6 months, and the kinds of activities you'd like to do together."
- Tap to record → tap to stop. We transcribe and an AI extracts:
  - **Name**
  - **Unavailable date ranges** (parsed into start/end dates within the 6-month window)
  - **Activity preferences** (a list of interests)
- Auto-saves silently (no review step) and drops the user straight into the dashboard. A subtle toast confirms "Saved — welcome, {name}".

### 3. Dashboard
The single main screen. Sections top-to-bottom:

**a. Header**
- App title, today's date, and a small list of who has submitted with each person's "last updated" timestamp (e.g. "Maya — updated 2 days ago").

**b. Availability grid (the centerpiece)**
- Left column: each friend's name (rows added as new people submit).
- Right side: a horizontally scrollable strip of every day across the next ~6 months, grouped visually by week and labeled by month.
- Each cell:
  - **Green** = that person is available
  - **Red** = that person is unavailable
- **Gold vertical bar** spans the full column on any day where *everyone who has submitted* is available — these are the "go" days.
- Sticky name column on scroll; today is marked with a thin marker line.
- Hovering/tapping a gold day shows a tooltip: "Everyone free — {date}".

**c. "Update my response" row**
- Next to the current user's name, a mic icon with helper text:
  > "Tap to update your availability or activity preferences."
- Same voice flow as onboarding; AI merges the new info into their existing record (replaces unavailable ranges + activity list) and bumps their "last updated."

**d. Overlap callout**
- A prominent card under the calendar listing the next handful of fully-overlapping days (the gold ones), with quick-glance day-of-week + date.
- If none exist yet: "No fully overlapping days yet — more responses needed."

**e. AI activity summary (bottom)**
- An AI-generated paragraph summarizing what the group collectively wants to do.
- **Top recommendation**: the activity with the most volume + similarity across submissions (e.g. "Outdoor hikes — 4 of 5 of you mentioned this").
- **Most unique pick**: a callout highlighting the most distinctive activity someone suggested (e.g. "Wildcard: pottery night — suggested by Jordan").
- Recomputes whenever someone submits or updates.

---

### How it works behind the scenes
- **Backend**: Lovable Cloud stores the shared password hash, member records (name, unavailable ranges, activities, last_updated), and a cached AI summary.
- **Voice**: browser records audio → edge function transcribes via Lovable AI → second AI call extracts structured fields (name, date ranges, activities) using tool calling → saved to DB.
- **AI summary**: edge function aggregates all members' activity lists and asks the AI for {summary, top_recommendation, unique_pick}.
- **No accounts** — identity is just the name from your voice intro, tied to this device. Re-recording from the same device updates your existing entry; from a new device you'd pick your name from the list to claim it.

### Design direction
- Warm, calm, low-chrome. Soft neutral background, friendly serif or rounded-sans display for headings, clean sans for body. The availability grid is the hero — generous whitespace around it, gold bars feel celebratory when they appear.
