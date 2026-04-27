# Simplify onboarding to a name picker

## Goal
Friends shouldn't have to use voice on first entry. After the password screen, they pick their name from a list and land on the dashboard. From there they can either **tap days in their row** OR **use the mic** to update.

## Changes

### 1. Seed the 3 missing members (DB migration)
The `members` table currently has Alyosha, Anthony, Nick, Tyler. Add Eric, Jakob, Alex with empty `unavailable_ranges` and `activities` so they appear in the picker and on the grid immediately.

```sql
INSERT INTO public.members (name, unavailable_ranges, activities)
VALUES ('Eric', '[]'::jsonb, '[]'::jsonb),
       ('Jakob', '[]'::jsonb, '[]'::jsonb),
       ('Alex', '[]'::jsonb, '[]'::jsonb);
```
(Plain inserts — no unique constraint exists on `name`, and these three names aren't in the table.)

### 2. Rewrite `src/components/Onboarding.tsx` — name picker
- Fetch all members from `public.members` (already publicly readable).
- Render a card titled **"Who are you?"** with one tappable button per friend (all 7 names).
- On click: `session.setMember(id, name)` then call `onDone()` to drop into the dashboard.
- Remove `VoiceCapture` and the 3-step instructions from this screen entirely.
- Small footer link: *"Not on the list? Ask the group to add you."* (no action — just guidance).

### 3. Update `src/components/Dashboard.tsx`
- **Add prominent help text** above the calendar:
  > 👇 Tap the dates next to your name that you're **not** available. Or use the mic below to speak your updates.
- **Keep the existing voice update card** ("Update availability and activity preferences, NAME") — unchanged, still uses `VoiceCapture` in update mode.
- **Remove the "Are you one of these friends?" identity-claim section** — no longer needed since onboarding handles identity.
- **Remove the "Haven't submitted yet?" fallback section** — every visitor now has a `currentMemberId` after onboarding.

### 4. Availability grid (`AvailabilityGrid.tsx`) — minor polish only
- Already shows **"Updated X ago"** under each name ✅ — keep as-is.
- Already supports tap-to-toggle for the current user's row ✅.
- Strengthen the legend tip from *"Tip: tap a day in your row to flip it."* to **"👆 Tap any day in your row to flip green ↔ red."** so it's unmistakable.

## Flow after changes
1. Password screen → enter group password.
2. **Name picker** → tap your name.
3. Dashboard → tap days in your row to toggle availability, or tap the mic to dictate updates. Last-updated time stays visible next to every name.

## Files touched
- New migration to seed Eric, Jakob, Alex
- `src/components/Onboarding.tsx` (rewrite)
- `src/components/Dashboard.tsx` (remove claim/fallback sections, add help text)
- `src/components/AvailabilityGrid.tsx` (legend text tweak)

## Notes
- Device persistence still works: once someone picks their name, `session.setMember` stores it in localStorage so they skip the picker next visit (until they sign out, which only clears the password).
- If a friend signs in on a new device, they'll see the picker again and just re-select their name — same row, no duplicate.
