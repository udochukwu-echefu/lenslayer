# LensLayer mobile: build guide and handoff

This is the working brief for whoever continues the mobile app (Codex or a person).
Read it top to bottom once before changing anything. Section 9 is the task list.

- **App:** `mobile/` (Expo SDK 58, React Native 0.88, expo-router, TypeScript strict)
- **Design source:** `mobile/design/` (91 screens as HTML + one stylesheet). Approved by the owner.
- **Backend:** `backend/` (FastAPI, `/api/v1`). Do not change it. The dashboard in `dashboard/` is the reference client.
- **Branch:** `claude/sweet-wu-5e3262`

---

## 1. Where things stand

A first full pass is **already built**. It type-checks, lints clean, and runs in the web preview
against a local backend (sign-in, workspace setup, all five tabs and the floating tab bar were
seen working with an empty workspace).

| Area | State |
|---|---|
| Theme, fonts, shared UI kit | Done, matches the approved design |
| Floating tab bar + navigation | Done |
| Sign-in, workspace setup, invitation link | Done |
| Overview ("Today"), Inbox, Notifications, Search, Reports | Done |
| Agreements list, upload | Done |
| Contract review (11 tabs, share sheet) | Built, **not yet seen with real review data** |
| Ask (workspace and per contract) | Built, **not yet seen answering** |
| Renewals (Dates + Tasks) | Done for the list views |
| Settings (8 sections + Team) | Done |
| 11 create/upload forms | Built, **only one path exercised by hand** |
| Native iOS / Android run | **Not done.** Only the web preview has been run |
| Automated tests | **None yet** (`npm test` finds 0 tests) |

What "not yet seen with real data" means: the test backend had no worker and no model key, so no
contract ever finished review. Those screens compile against the real API types, but nobody has
looked at them filled in. Treat them as unverified.

---

## 2. Run it

```bash
cd mobile
npm ci
cp .env.example .env.local      # then set the API URL; "local" auth mode needs no Auth0
npx expo start                  # press i (iOS simulator), a (Android), w (web)
```

Backend for local development (from the repo root, see `README.md`):

```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env            # LENSLAYER_PLATFORM_AUTH_MODE=local
uvicorn backend.app.main:app --reload --port 8000
```

For the web preview the backend must allow its origin:
`LENSLAYER_PLATFORM_CORS_ORIGINS=http://localhost:8081`.
To get finished reviews you also need the worker running and a model key (see `backend/README.md`).

Checks. All four must pass before any task is called done:

```bash
npx tsc --noEmit                        # types
npx eslint src                          # lint (0 errors, 0 warnings today)
node scripts/check-shared-types.mjs     # API types still match the dashboard
npm test                                # unit tests
```

---

## 3. Rules that are not negotiable

1. **Read `mobile/AGENTS.md` first.** Expo changes every release. Check the SDK 58 docs before
   using any Expo or React Native API; do not rely on memory.
2. **Install packages with `npx expo install <name>`**, never `npm install <name>`.
3. **Never edit `src/lib/shared/types.ts` by hand.** It is a byte-for-byte copy of
   `dashboard/src/lib/types.ts`. If the API changes, copy the file over.
4. **Never hand-create `ios/` or `android/`.** Native config goes in `app.json`.
5. **Do not change the backend or the dashboard** as part of mobile work.
6. **The backend enforces permissions.** `canUpload`, `canDelete`, `canManageTeam` only decide
   which controls to show. Never treat a hidden button as security.
7. **No secrets in `EXPO_PUBLIC_*`.** Those values ship inside the app.
8. **LensLayer never decides for the user.** No screen may auto-create a task, auto-approve, or
   present an unverified answer as final. Every material claim shows its source clause.
9. **Copy:** plain words, sentence case, no em dashes, no exclamation marks. Buttons say what
   happens ("Save decision", not "Submit").

---

## 4. How the code is organised

```
mobile/
  app.json, package.json, eslint.config.js, tsconfig.json
  design/                    the approved design (reference only, not shipped)
  scripts/check-shared-types.mjs
  src/
    app/                     ROUTES ONLY. One file = one screen. No reusable logic here.
      _layout.tsx            providers, fonts, root stack, sign-in guards
      sign-in.tsx, workspace-setup.tsx, notifications.tsx, search.tsx
      invite/[token].tsx
      contract/[id].tsx
      new/*.tsx              modal forms
      (tabs)/_layout.tsx     the floating tab bar
      (tabs)/(overview)/     index (Today), inbox, reports
      (tabs)/contracts/      index
      (tabs)/ask/            index
      (tabs)/renewals/       index (Dates), tasks
      (tabs)/settings/       index, [section], team
    components/
      ui/                    the UI kit. Import everything visual from "@/components/ui"
      contract/              the contract review tabs
      *.tsx                  domain pieces shared by several screens
    lib/
      api/                   client.ts (transport), index.ts (every endpoint), qa-stream.ts
      shared/types.ts        API types (copied from the dashboard)
      auth.tsx, workspace.tsx, queries.ts, format.ts, links.ts, files.ts, config.ts, storage.ts
    theme/
      tokens.ts              every colour, size, radius and font
      theme-provider.tsx     light / dark / system
      create-styles.ts       createStyles((colors) => ({...})) returns a useStyles hook
```

### Data flow (one direction)

```
screen  ->  hook in lib/queries.ts (TanStack Query)  ->  api.* in lib/api/index.ts  ->  client.ts  ->  backend
```

- A screen never calls `fetch`. It calls `api.something(organizationId, ...)` through
  `useQuery` / `useMutation`.
- After a write, invalidate with `invalidateWorkspaceRecords(queryClient, organizationId, ...)`
  or the specific query key, so every list showing that record refreshes.
- Query keys match the dashboard's (`["contracts", orgId, ...]`, `["tasks", orgId, ...]`).
  Keep them matching.
- Lists use infinite queries (25 rows, then `LoadMore`).

### How to write a screen

Every screen follows the same shape. Copy it.

```tsx
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { EmptyState, ErrorState, ListRow, Loading, Screen, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

/** One sentence: what this screen is for and anything a new reader would not guess. */
export default function ExampleScreen() {
  const { organizationId, canUpload } = useWorkspace();
  const query = useQuery({ queryKey: ["example", organizationId], queryFn: () => api.example(organizationId), enabled: Boolean(organizationId) });
  const items = query.data ?? [];

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {query.isLoading ? <Loading rows={4} />
        : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        : !items.length ? <EmptyState title="Nothing yet" message="One useful sentence." />
        : (
          <Section title="Section label">
            <View>{items.map((item, index) => <ListRow key={item.id} title={item.title} last={index === items.length - 1} />)}</View>
          </Section>
        )}
    </Screen>
  );
}
```

Every data screen handles **four states**: loading, error (with retry), empty, and filled.
A screen that only handles "filled" is not finished.

### Code style

- TypeScript strict. No `any`. No `// @ts-ignore`. Derive types from `shared/types.ts`.
- One component per concern. If a route file passes ~200 lines, move pieces to `components/`.
- Colours, spacing, radii and fonts come from `theme/tokens.ts`. **No hex codes and no raw font
  names in screens.** Styles go through `createStyles`, not inline objects, except one-off layout
  (`{ flex: 1 }`, a gap).
- All text goes through `<AppText variant=… tone=…>`. Never a bare `<Text>`.
- A short doc comment on each exported component saying *why it exists*, not what the code does.
- Every `Pressable` has `accessibilityRole` and a label when it has no visible text. Touch
  targets are at least 44pt. State is never colour alone (a badge always has a word).
- Render must be pure: no `Date.now()` or `Math.random()` in the body of a component
  (`useState(() => Date.now())` instead). The linter enforces this.
- Forms use `FormScreen` (Cancel, scrolling fields, one pinned primary button, keyboard handling).
- Values shown once (invite link, API key, webhook secret) use `OneTimeSecret`.

---

## 5. The design system

Source of truth: `design/ll.css` (the last block, "v4: clean pass", wins) and `design/F_System.dc.html`.
The app's equivalent is `src/theme/tokens.ts`. If the two disagree, the design wins; fix the token.

**Principles**

- White page. Lists are plain rows split by hairlines, never boxes.
- One soft grey fill (`raised`) for the few things that need a container.
- Icons are plain outlines with no coloured tile.
- Status is a 6pt dot plus a coloured word, never a filled pill.
- Section labels are sentence case, 14pt semibold, muted.
- One primary (filled) button per screen.
- Colour is kept for the one thing that matters most on a screen.

**Tokens**

| Token | Light | Use |
|---|---|---|
| canvas / surface | `#FFFFFF` | page |
| raised | `#F6F5F2` | cards, search field, chips, segmented track |
| well | `#F2F1ED` | skeletons, chart bars |
| line | `#EDEBE5` | hairlines |
| lineStrong | `#CFCBC0` | input and outline-button borders |
| ink | `#191A17` | text, primary button |
| muted / faint | `#66635A` / `#8A867B` | secondary text / captions |
| accent | `#834965` | links, back button, active tab |
| good / warning / danger / info | `#48602F` `#805C15` `#A13C36` `#3D5A86` | status words only |
| contracts / decisions / actions / dates | butter `#F6D868`, pink `#F5B8DA`, olive `#9AA963`, blue `#B5C9E8` | small dots marking a *destination*, never risk |

Dark values are in `tokens.ts`. Every screen must work in both; never hard-code a colour.

- **Spacing:** 4pt grid. Screen gutter 20. Sections 28 apart. Row min height 58.
- **Radius:** inputs 12, buttons 14, cards 16, sheets 22, pills 999.
- **Type (Figtree):** display 30 bold, title 22 semibold, heading 17 semibold, body 16,
  bodyStrong 16 medium, small 14, caption 12, eyebrow 14 semibold.
  Custom fonts are chosen by family name (`font.semibold`), never by `fontWeight`.
- **Tab bar:** floating pill, 14pt from the sides, radius 32, active tab on a `raised` pill with
  accent icon and label. Scrolling screens leave `tabBarClearance` at the bottom.

**UI kit (`@/components/ui`)**

`Screen`, `PageIntro`, `Section`, `Card`, `ListRow`, `Facts`, `SummaryBox`, `DateBlock`, `Avatar`,
`Divider`, `Eyebrow`, `AppText`, `Button`, `Badge`, `StatusBadge`, `SeverityBadge`, `Icon`,
`Loading`, `ErrorState`, `EmptyState`, `Notice`, `FormError`, `Field`, `TextField`, `SearchField`,
`Select`, `OptionSheet`, `Sheet`, `Segmented`, `Chips`, `ToggleRow`, `CheckRow`, `DateField`,
`confirm()`.

Use these. Add a new kit component only when two screens need the same new thing, and add its
icon names to `ui/icon.tsx` (one semantic name mapped to SF Symbols and Material Symbols).

---

## 6. Reading the design files

Each `design/<Name>.dc.html` is one 390×844 screen. Open it in a text editor: the markup inside
`<main class="scr">` is the screen, in order, with the real copy. Class names map to the kit:

| Design class | App component |
|---|---|
| `.lt` + `.sub` | native large title + first muted line |
| `.grp` with `.row` | `<View>` of `ListRow` |
| `.eb` | `Section title` / `AppText variant="eyebrow"` |
| `.card`, `.tint`, `.quote` | `Card`, `Notice`, `SourceQuote` |
| `.badge info/ok/warn/bad/n` | `Badge tone="info/success/warning/danger/neutral"` |
| `.chips` / `.chip.on` | `Chips` |
| `.seg` | `Segmented` |
| `.btn p / s / g / d` | `Button variant="primary / secondary / ghost / danger"` |
| `.field` + `.inp` | `TextField` / `Select` |
| `.tg` | `ToggleRow` |
| `.sheet` + `.grab` | `Sheet` / `OptionSheet` |
| `.date` | `DateBlock` |
| `.search` | `SearchField` |
| `.tabs` | the tab bar in `(tabs)/_layout.tsx` |

`design/canvas.json` lists every screen with its page (group) and title. The names and data in
the designs ("Harbor & Finch", "Northwind logistics MSA") are sample content. The app shows real
API data; never hard-code sample content.

To view them rendered: `cd mobile/design && python3 -m http.server 8765`, then open a file. They
need `support.js` from the design tool to render fully, so reading the markup is more reliable.

---

## 7. Screen map

Prefix key: S sign-in, O onboarding, H home, A agreements, C contract, Q ask, R renewals,
T tasks, X settings, E system states.

### Sign-in and onboarding

| Design | Route / file | API | State |
|---|---|---|---|
| Main, S_SplashDark | native splash (`app.json`) | none | White and near black match the app canvas; release cold start still needs device verification |
| S_Welcome | `sign-in.tsx` | Auth0 (PKCE) via `lib/auth.tsx` | Done |
| S_SignIn, S_SignInError, S_CreateAccount, S_SSO, S_Forgot, S_CheckEmail, S_NewPassword, S_PasswordDone | **Auth0's hosted page**, not native | Auth0 | By design, see note below |
| S_VerifyEmail, O_CreateWorkspace | `workspace-setup.tsx` | `organizations`, `createOrganization` | Done |
| S_SessionExpired | notice on `sign-in.tsx` | none | Done as a notice |
| S_FaceID | not built | none | Task 5 |
| O_InviteTeam, O_FirstRun | Overview checklist | `members`, `invitations`, `queryOverview`, `createInvitation` | Invite and upload steps use existing forms |
| O_Notifications | not built | none | Device push needs backend support (task 6) |
| O_Invite, O_InviteInvalid | `invite/[token].tsx` | `invitation`, `acceptInvitation` | Done |

**Password screens.** The app signs in with OIDC authorization-code + PKCE. The password is typed
into Auth0's page in a secure browser sheet, so the app never sees it. The eight password and SSO
designs describe that hosted page. Do **not** build native password fields; style the Auth0
Universal Login page to match instead (colours and logo are set in the Auth0 dashboard).

### Home

| Design | Route / file | API | State |
|---|---|---|---|
| H_Overview(+Dark) | `(tabs)/(overview)/index.tsx` | `queryOverview`, `notifications` | Done |
| H_Switcher | `components/workspace-switcher.tsx`, `new/workspace.tsx` | `organizations`, `createOrganization` | Can switch workspaces or create and enter a new one |
| H_Search | `search.tsx` | `searchWorkspace` | Done, recent searches missing |
| H_Inbox | `(tabs)/(overview)/inbox.tsx` | `queryContracts`, `queryTasks` | Done |
| H_Notifications(+Empty) | `notifications.tsx` | `notifications`, `markNotificationRead`, `markAllNotificationsRead` | Done |
| H_Reports | `(tabs)/(overview)/reports.tsx` | `reportOverview`, `downloadReportExport` | Done |

### Agreements

| Design | Route / file | API | State |
|---|---|---|---|
| A_List, A_Empty | `(tabs)/contracts/index.tsx` | `queryContracts` | Done |
| A_Filter | sort sheet only | same | Type filter pending a server-side filter; `contract_type` is currently a sort field |
| A_UploadSource, A_UploadDetails, A_UploadData | `new/contract.tsx` (one form) | `createContract`, `organizationSettings` | Built as one scrolling form, verify on device |
| A_Processing, A_Failed | inside `contract/[id].tsx` | `contract` (polls while moving) | Built, unverified |

### Contract review (`contract/[id].tsx` + `components/contract/*`)

| Design | Tab / file | API | State |
|---|---|---|---|
| C_Overview | `overview` (in the route file) | `contract`, `review` | Built, unverified |
| C_Passport | `passport.tsx` | `dealPassport` | Built, unverified |
| C_Risks, C_Finding | `risks` + `findings.tsx` | `review` | Built as one list, no separate finding screen |
| C_Obligations | `obligations` + `findings.tsx` | `review` | Built, unverified |
| C_Ask | `question-panel.tsx` | stream `…/contracts/{id}/questions` | Built, unverified |
| C_Negotiate | `negotiate.tsx` | `negotiationItems`, `versions`, `counterpartyResponses`, `updateNegotiationItem` | Built, unverified |
| C_Versions | `contract/[id]/versions.tsx`, list inside `negotiate.tsx` | `versions` | Shows the saved changes, revision notes and version history |
| C_Discussion | `discussion.tsx` | `comments`, `createComment` | Built, unverified |
| C_Approvals, C_ApproveSheet | `decisions.tsx` | `approvals`, `decideApproval`, `decisions` | Built, unverified |
| C_DecisionSheet | `new/decision.tsx` | `createDecision` | Built |
| C_Actions | `actions.tsx` | `queryTasks` | Built |
| C_Lifecycle | `lifecycle.tsx` | `queryLifecycle`, `updateLifecycle` | Built |
| C_Activity | `activity.tsx` | `contractActivity`, `deleteContract` | Built |
| C_ShareSheet, C_ShareLink | `share-sheet.tsx` | `shares`, `createShare`, `revokeShare`, exports | Built, unverified |

### Ask

| Design | Route / file | API | State |
|---|---|---|---|
| Q_Home, Q_Streaming, Q_Answer, Q_NoEvidence | `(tabs)/ask/index.tsx` + `question-panel.tsx` | stream `…/portfolio/questions` | Built, unverified. Recent questions missing (no API for it) |

### Renewals and tasks

| Design | Route / file | API | State |
|---|---|---|---|
| R_Agenda | `components/renewals-view.tsx` (Dates) | `queryLifecycle` | Done |
| R_Detail, R_ReminderSheet | `DateSheet` in `renewals-view.tsx` | `updateLifecycle` | Built as a sheet, editing reminder missing |
| R_Month | not built | `queryCalendar` | Task 10 |
| R_Upcoming | not built | `queryLifecycle` | Task 10 |
| R_AddDate | `new/lifecycle.tsx` | `createLifecycle` | Built |
| R_Export | header button | `downloadCalendarExport` | Done (.ics only) |
| T_List | `renewals-view.tsx` (Tasks) | `queryTasks`, `queryTaskCounts` | Done |
| T_Detail | not built (status sheet only) | `updateTask` | Task 11 |
| T_New | `new/task.tsx` | `createTask` | Built |
| T_Status | `OptionSheet` in `task-row.tsx` | `updateTask` | Done |

### Settings

| Design | Route / file | API | State |
|---|---|---|---|
| X_Home | `(tabs)/settings/index.tsx` | `organizationSettings`, `members` | Done |
| X_Profile, X_DeleteAccount | `ProfileSection` | `me`, `accountDeletionPreview`, `deleteAccount` | Built, delete unverified |
| X_SignOut | `confirm()` on the home screen | none | Done |
| X_General | `GeneralSection` | `updateOrganizationSettings`, `intakeEmailAddress` | Built |
| X_Team, X_Member | `(tabs)/settings/team.tsx` | `members`, `updateMemberRole`, `removeMember`, `invitations`, `revokeInvitation` | Done, member detail is a role sheet |
| X_Invite, X_InviteLink | `new/invitation.tsx` | `createInvitation` | Built |
| X_Data | `DataSection` | `updateOrganizationSettings` | Built |
| X_Notifications | `NotificationsSection` | `updateOrganizationSettings` | Workspace toggles only, see task 6 |
| X_Security, X_ApiKey, X_ApiKeyCreated | `SecuritySection`, `new/api-key.tsx` | `apiKeys`, `createApiKey`, `revokeApiKey`, `auditEvents` | Built |
| X_Integrations, X_Webhook | `IntegrationsSection`, `new/webhook.tsx` | `integrations`, `integrationProviders`, `webhooks`, `createWebhook`, `webhookDeliveries` | Built |
| X_Appearance | `AppearanceSection` | none (stored on device) | Done |
| X_About | `AboutSection` | none | Done, check the three web links exist |

### System states

| Design | Where | State |
|---|---|---|
| E_Loading | `Loading` | Done |
| E_Error | `ErrorState` | Done |
| E_ReadOnly | `Notice` in forms and action lists | Done |
| E_Offline | not built | Task 4 |

---

## 8. Things that will trip you up

- **Typed routes.** `app.json` turns on `typedRoutes`. After adding a route file, run
  `npx expo start` once so `.expo/types` regenerates, or `router.push` to it will not type-check
  in an editor.
- **Custom tabs** use `expo-router/ui` (`Tabs`, `TabSlot`, `TabList`, `TabTrigger`). `TabList`
  must be a direct child of `Tabs`. The API is marked experimental; re-check the docs on upgrade.
- **Uploads** send multipart form data with the same field names as the web form
  (`file`, `title`, `counterparty`, `contract_type`, `party_role`, `goal`, `risk_tolerance`,
  `jurisdiction`, `retention_days`, and `retain_document` / `retain_source_text` only when on).
- **Streaming answers** (`lib/api/qa-stream.ts`) read NDJSON frames. Partial text is provisional.
  Only a `final` frame with valid citations is an answer. Do not weaken that validation.
- **Deep links:** the root navigator waits for session and workspace restoration before applying
  route guards, so reload can keep the requested destination.
- **Large titles** are iOS only. Android and web show "Today" in the Overview content below the
  workspace switcher and header actions.
- **Dates** format with the device's locale (`formatDate` passes `undefined`), so UK phones show
  "16 November" and US phones "November 16".
- The linter ignores `src/lib/shared/` on purpose (it must stay identical to the dashboard file).

---

## 9. What is left, in order

Do these as separate commits (or pull requests), smallest first. Each has a "done when".

1. **Splash and app chrome.** In `app.json` set the splash `backgroundColor` to `#FFFFFF`
   (it is still the old cream `#FAF7F0`). Check the status bar and Android navigation bar colours
   in both themes. *Done when* cold start shows white, then the app, with no colour flash.

2. **Verify every built screen with real data.** Run the backend with the worker and a model key,
   upload two or three contracts, and walk every contract tab, Ask, share sheet and each form.
   Fix what is wrong against the matching design file. *Done when* each row marked "unverified" in
   section 7 has been seen filled in on an iOS simulator, in light and dark.

3. **Native run and platform polish.** Run on an iOS simulator and an Android emulator. Fix
   keyboard overlap on forms, safe-area spacing under the tab bar, the Android/web header, and the
   web reload redirect. *Done when* every tab and one form work on both platforms.

4. **Offline and failure states (E_Offline).** Add a dark banner at the top of list screens when
   the device is offline ("You’re offline. Showing what was saved at 9:41."), keep showing cached
   data, and disable writes. Use TanStack Query's `onlineManager` with the network module Expo
   recommends for SDK 58. *Done when* turning on airplane mode shows the banner and nothing crashes.

5. **Face ID unlock (S_FaceID).** Optional app lock using the Expo local-authentication module,
   with a toggle in Settings ("Unlock with Face ID") and "Use password instead" falling back to
   normal sign-in. Never store the session behind anything weaker than SecureStore.
   *Done when* the toggle works on a simulator with Face ID enrolled.

6. **Push reminders and first-run (O_Notifications, O_InviteTeam, O_FirstRun, X_Notifications).**
   This needs backend support for device tokens that **does not exist yet**. Stop and ask the owner
   before starting. Without it, build only the first-run checklist on Overview (invite your team,
   upload a contract) using existing endpoints.

7. **Create a workspace from the switcher.** Add the button from H_Switcher. It needs a route that
   is reachable while signed in with a workspace (the current `workspace-setup` is guarded).

8. **Agreements filter sheet (A_Filter).** Add filtering by contract type. Check whether
   `queryContracts` accepts a type filter (see `backend/` and the dashboard's contracts page);
   if not, leave it out rather than filtering only the loaded page.

9. **Version compare (C_Versions).** A screen showing `comparison.added` and `comparison.removed`
   for a version: removed lines struck through on a soft red block, added lines on a soft green
   block. This is one of the few places colour is intended.

10. **Calendar month and reminder list (R_Month, R_Upcoming).** Month grid from `queryCalendar`
    (check the dashboard's calendar page for the exact `CalendarWindow` values), dots under days
    with items, tapping a day lists them.

11. **Task detail (T_Detail).** A screen for one action: owner, due, status, priority, type, the
    linked clause, and editing each through `updateTask`.

12. **Tests.** Unit tests for pure helpers in `lib/` (`format.ts`, `links.ts`, the stream parser)
    in `mobile/tests/*.test.ts`, run by `npm test`. Port the cases from the dashboard's tests where
    the function was ported from there.

13. **Release setup.** EAS project, bundle identifiers, icons, Auth0 native application and
    callback URLs (`lenslayer://auth`), store listings. Ask the owner; this needs their accounts.

**Stop and ask the owner** before: adding a backend endpoint, adding a paid service, changing
auth, or dropping a designed screen.

---

## 10. Review checklist

The reviewer will check each change against this list.

- [ ] `npx tsc --noEmit`, `npx eslint src`, `node scripts/check-shared-types.mjs`, `npm test` all pass
- [ ] Matches the design file named in section 7 (layout, copy, spacing, both themes)
- [ ] Loading, error, empty and filled states all exist
- [ ] No hex colours, raw font names or bare `<Text>` in screens
- [ ] No sample data hard-coded; everything comes from the API
- [ ] Viewer role sees a read-only screen, not a broken one
- [ ] Buttons and icon-only controls have accessibility labels; targets are 44pt or more
- [ ] Writes invalidate the right queries, so lists update without a manual refresh
- [ ] No new dependency without `npx expo install` and a reason in the commit message
- [ ] Section 7 of this file is updated when a screen's state changes

---

## 11. Background reading

- `PRODUCT.md` and `DESIGN.md` at the repo root: product principles and the wider design language
- `mobile/README.md`: environment variables and Auth0 setup
- `dashboard/src/app/(workspace)/`: the web version of every screen, the reference for behaviour
- `dashboard/src/lib/api/`: the web API client the mobile one was ported from
