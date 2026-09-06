# GodHealth KCA Daily + Weekly Execution Loop — Quality Gate

This checklist protects the existing GodHealth KCA and Coach Dashboard while adding the Daily + Weekly Coaching Execution Loop.

## Automated local checks

Run:

```bash
node kca/run-acceptance-tests.js
node kca/execution-loop-quality-gate.js
```

Expected:

- Existing KCA V3 acceptance tests pass.
- Execution loop static quality checks pass.

## Manual Supabase/auth checks

Run these after applying `supabase/migrations/202609060001_kca_execution_loop.sql` to the production Supabase project.

1. Client Today default
   - Invite/activate a premium client.
   - Open `/kingdom-capacity-assessment/` while signed in as that client.
   - Expected: the first authenticated screen is `TODAY`, not the assessment form.

2. Duplicate taps
   - Tap the same Foundation quickly multiple times.
   - Expected: only one `daily_foundation_logs` row exists for the same `client_user_id + prescription_id + log_date`.

3. Save failure behavior
   - Simulate blocked network or invalid session.
   - Tap a Foundation.
   - Expected: no green success state is shown unless the Supabase RPC succeeds. Failed saves show `Not saved — tap to retry`.

4. Client isolation
   - Sign in as Client A.
   - Try to call execution RPCs for Client B from the browser console.
   - Expected: request fails with authorization error; Client A cannot read or write Client B data.

5. Coach isolation
   - Sign in as a coach assigned to Client A only.
   - Try to open Client B execution detail.
   - Expected: request fails with authorization error.

6. N/A / unprescribed foundations
   - Mark a Foundation as not prescribed for the next week.
   - Expected: it does not appear in the client’s Today list and does not affect the weekly denominator.

7. Prescription changing mid-program
   - Save new targets with an effective date in the future.
   - Expected: older weeks keep their historical targets; new week uses the new target.

8. Week rollover and local date
   - Test on Sunday/Monday around local Amsterdam time.
   - Expected: weekly summaries use the correct Monday–Sunday coaching week and local date.

9. Missing reflection
   - Do not submit a reflection.
   - Expected: coach dashboard shows reflection missing without blocking daily execution scores.

10. Partial week
    - Start a client mid-week.
    - Expected: summary calculates from prescribed opportunities only.

11. Zero opportunities
    - Disable all Foundations for a test week.
    - Expected: execution percentage is 0 and status is `Not Started`, without errors.

12. Mobile sizes
    - Open Today on a phone-width screen.
    - Expected: client can complete the daily checklist with minimal scrolling and no save button.

13. Historical target integrity
    - Open a previous week after saving new targets.
    - Expected: previous week still shows the prescriptions/targets that were active during that week.

14. Direct RPC manipulation
    - Try to pass another user ID or another prescription ID to the toggle RPC.
    - Expected: Supabase rejects the write.
