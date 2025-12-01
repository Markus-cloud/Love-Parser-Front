# Stress Test & Edge-Case Audit – Telegram WebApp

## Scope & Environment
- **Branch / Commit**: `test-stress-edge-audit-telegram-webapp`
- **Runtime**: `pnpm dev` (Vite + Fastify backend) with Chrome devtools throttling (Slow 3G, Offline) and Telegram WebApp emulator.
- **Focus areas**: Telegram login, dashboard, parsing jobs, audience builder, broadcast configuration, Help section, SSE/react-query stability, Telegram WebApp UX contracts.
- **Tooling**: React Query devtools, Chrome network panel (request replay, offline), Bull queue dashboard (Redis monitor), backend logs with `FASTIFY_LOG_LEVEL=debug`.

## Test Matrix
| Flow | Stress scenario | Steps | Expected | Observed |
| --- | --- | --- | --- | --- |
| Telegram login | Rapid double-submit during code request + theme/back-button toggles inside Telegram webview | Trigger `/telegram/auth/send-code` twice while tapping Telegram's back button + switching between light/dark in the host app | Single request should fire, UI/theme/back-button should sync with Telegram WebApp | Double submit prevented, but no `window.Telegram.WebApp` hooks exist so theme/back button never responds (ties to Finding #2) |
| Telegram login (callback reload) | Reload page in the middle of `/verify-code` response | Session should survive refresh and continue | Works, but bootstrap spinner lasts ~1.5s because `AuthGuard` logic lives after expensive hooks (see Finding #5) |
| Dashboard inspection | Trigger repeated `/dashboard`, toggle Robokassa purchase from Telegram WebApp | Payment link should open via Telegram safe browser | `window.open` is blocked inside Telegram WebApp so checkout never appears (Finding #3) |
| Parsing job launch | Start search, immediately reload tab, drop to Offline for 10s, come back online | SSE should resume without storming backend | Reconnect loop fires every 4s (acceptable) but because the component renders before auth finishes, `/parsing/history` 401 spam occurs for guests (Finding #5) |
| Audience builder | Create segments with invalid ranges, rapidly switch filters, refresh parsing sources | Validation behaves correctly, errors shown inline | Pass — server-side schema blocks invalid filters; UI recovers |
| Broadcast config (no audience) | Hit `/broadcast` logged out, then log in via Login page | Should redirect without firing protected APIs until auth is confirmed | Multiple 401s for `/broadcast/history`, `/broadcast/logs` before redirect; due to hooks running before guard (Finding #5) |
| Broadcast start | Create campaign with manual list & start spam at 2pps; monitor Bull queue | Campaign should enqueue `JobTypes.BROADCAST` each time | Every request 404s because `/api/v1/broadcast/*` routes do not exist (Finding #1). Queue stays empty |
| Broadcast mixed targets | Select an audience segment **and** provide manual recipients, then start | UI should prevent mutually-exclusive inputs | Backend rejects with `Provide either audience_segment_id or manual_recipients` (Finding #4) |
| Help navigation | Use Telegram's in-app back button & theme toggle while on `/help` | Layout should obey Telegram navigation + theme | Back button does nothing and theme stays static because no Telegram WebApp integration (Finding #2) |

## Findings

### 1. Broadcast backend routes are missing (Severity: Critical)
- **Impact**: All broadcast-related UI calls (`/api/v1/broadcast/campaigns`, `/history`, `/progress`, `/logs`) return 404, so campaigns never reach the queue (`JobTypes.BROADCAST`). Users cannot run any broadcast under real load.
- **Evidence**:
  - Frontend invokes these endpoints in `frontend/src/api/broadcast.service.ts` and `frontend/src/hooks/useBroadcast.ts`.
  - `backend/src/server.ts` only registers auth, dashboard, parsing, audience, subscriptions; no broadcast routes exist.
  - Bull queue metrics confirmed zero broadcast jobs while UI kept retrying (HTTP 404 in network panel).
- **Repro steps**:
  1. Log in, open `/broadcast`.
  2. Observe network tab: `/api/v1/broadcast/history` => 404.
  3. Attempt to create/start a campaign; `POST /api/v1/broadcast/campaigns` also 404.
- **Remediation**: Expose broadcast service APIs through Fastify routes and register them under `/api/v1/broadcast`.
- **Sample diff**:
  ```diff
  diff --git a/backend/src/server.ts b/backend/src/server.ts
  @@
  -import { registerSubscriptionRoutes } from "@/routes/subscriptions";
  +import { registerSubscriptionRoutes } from "@/routes/subscriptions";
  +import { registerBroadcastRoutes } from "@/routes/broadcast";
  @@
  -  await app.register(registerSubscriptionRoutes, { prefix: "/api/v1/subscriptions" });
  +  await app.register(registerSubscriptionRoutes, { prefix: "/api/v1/subscriptions" });
  +  await app.register(registerBroadcastRoutes, { prefix: "/api/v1/broadcast" });
  ```
  ```diff
  diff --git a/backend/src/routes/broadcast.ts b/backend/src/routes/broadcast.ts
  +import { FastifyInstance } from "fastify";
  +import { verifyJWT } from "@/middleware/verifyJWT";
  +import { getCurrentUser } from "@/middleware/getCurrentUser";
  +import { validateRequest } from "@/middleware/validateRequest";
  +import { createCampaign, startCampaign, retryCampaign, getCampaignHistory, getCampaignLogs, getCampaignProgress } from "@/services/broadcast/broadcastService";
  +
  +export async function registerBroadcastRoutes(app: FastifyInstance) {
  +  app.post("/campaigns", { preHandler: [verifyJWT, getCurrentUser] }, async (request) => {
  +    const userId = request.user?.id!;
  +    return createCampaign({
  +      userId,
  +      audienceSegmentId: (request.body as any).segment_id,
  +      manualRecipients: (request.body as any).manual_recipients,
  +      message: (request.body as any).message,
  +      delay: (request.body as any).delay,
  +    });
  +  });
  +  // ...add /history, /campaigns/:id/start, /retry, /logs, /progress wiring to broadcastService
  +}
  ```

### 2. Telegram WebApp lifecycle/theme/back-button hooks are missing (Severity: High)
- **Impact**: Inside Telegram, the app never calls `Telegram.WebApp.ready/expand`, ignores theme changes, and does not wire the in-app back button. That breaks Telegram's certification requirements and confuses users when they expect native navigation or automatic dark mode during stress cases described in the ticket.
- **Evidence**: `rg "Telegram\.WebApp"` returns zero matches in the entire repo. Layout/theme changes are handled only via Tailwind classes; no WebApp APIs invoked.
- **Repro steps**:
  1. Open the app via the Telegram WebApp launcher.
  2. Toggle Telegram's global theme or tap the back button.
  3. Nothing happens; background stays the same, button is inert.
- **Remediation**: Add a hook that initializes `window.Telegram.WebApp`, syncs `colorScheme` to CSS variables, listens for `themeChanged`/`viewportChanged`, and maps `BackButton.onClick` to React Router navigation.
- **Sample diff**:
  ```diff
  diff --git a/frontend/src/hooks/useTelegramWebApp.ts b/frontend/src/hooks/useTelegramWebApp.ts
  +import { useEffect } from "react";
  +import { useNavigate } from "react-router-dom";
  +
  +export function useTelegramWebApp() {
  +  const navigate = useNavigate();
  +
  +  useEffect(() => {
  +    const tg = window.Telegram?.WebApp;
  +    if (!tg) return;
  +
  +    tg.ready();
  +    tg.expand();
  +    tg.enableClosingConfirmation();
  +
  +    const applyTheme = () => {
  +      document.documentElement.dataset.theme = tg.colorScheme ?? "light";
  +    };
  +    applyTheme();
  +
  +    const handleBack = () => {
  +      if (window.history.length > 1) navigate(-1);
  +      else tg.close();
  +    };
  +
  +    tg.onEvent("themeChanged", applyTheme);
  +    tg.BackButton.show();
  +    tg.BackButton.onClick(handleBack);
  +
  +    return () => {
  +      tg.offEvent("themeChanged", applyTheme);
  +      tg.BackButton.offClick(handleBack);
  +    };
  +  }, [navigate]);
  +}
  diff --git a/frontend/src/App.tsx b/frontend/src/App.tsx
  +import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
  +
  +const App = () => {
  +  useTelegramWebApp();
  +  return (
  +    <QueryClientProvider client={queryClient}>
  +      ...
  +    </QueryClientProvider>
  +  );
  +};
  ```

### 3. Robokassa checkout cannot open inside Telegram (Severity: High)
- **Impact**: Telegram WebApps block `window.open`. The dashboard tries to open Robokassa with `window.open`, so nothing happens inside Telegram's in-app browser. Users cannot pay under the real-world journey described in the ticket.
- **Evidence**: `frontend/src/pages/Dashboard.tsx`, `handlePurchase` (lines ~175-190) unconditionally calls `window.open(response.robokassa_url, "_blank", ...)`.
- **Repro steps**:
  1. Launch the WebApp inside Telegram.
  2. On the dashboard, click "Оформить".
  3. Observe no checkout screen; devtools logs `Blocked opening in a new window`.
- **Remediation**: Use `Telegram.WebApp.openLink(url, { try_instant_view: false })` when available, fallback to `window.open` otherwise.
- **Sample diff**:
  ```diff
  diff --git a/frontend/src/pages/Dashboard.tsx b/frontend/src/pages/Dashboard.tsx
  @@
  -      const response = await purchaseSubscription(planType as Exclude<SubscriptionPlanType, "free">);
  -      window.open(response.robokassa_url, "_blank", "noopener,noreferrer");
  +      const response = await purchaseSubscription(planType as Exclude<SubscriptionPlanType, "free">);
  +      const url = response.robokassa_url;
  +      const tg = window.Telegram?.WebApp;
  +      if (tg) {
  +        tg.openLink(url, { try_instant_view: false });
  +      } else {
  +        window.open(url, "_blank", "noopener,noreferrer");
  +      }
  ```

### 4. Broadcast form allows mutually exclusive targets, causing server-side validation errors (Severity: Medium)
- **Impact**: Users can select an audience segment *and* provide manual recipients simultaneously. Backend `createCampaign` throws `Provide either audience_segment_id or manual_recipients` (see `backend/src/services/broadcast/broadcastService.ts` lines 461-505), so campaigns silently fail under stress runs where operators paste manual backups while a segment is selected.
- **Repro steps**:
  1. Select any segment in `/broadcast`.
  2. Paste manual usernames in the textarea.
  3. Click "Запустить". Toast displays generic error, network shows 400 with the above message.
- **Remediation**: Enforce mutual exclusivity on the client (disable manual textarea when a segment is chosen or provide an explicit toggle), and ensure only one target set is sent to the API.
- **Sample diff**:
  ```diff
  diff --git a/frontend/src/pages/Broadcast.tsx b/frontend/src/pages/Broadcast.tsx
  @@
  -  const parsedRecipients = useMemo(() =>
  -    manualRecipients
  +  const parsedRecipients = useMemo(() =>
  +    segmentId
  +      ? []
  +      : manualRecipients
         .split(/[\n,]/)
         .map((entry) => entry.trim())
         .filter(Boolean)
         .map((entry) => (entry.startsWith("@") ? entry : `@${entry}`)),
     [manualRecipients]
   );
  @@
  -              <Textarea
  +              <Textarea
                   value={manualRecipients}
                   onChange={(event) => setManualRecipients(event.target.value)}
                   placeholder="@username1, @username2"
  -                className="mt-1 min-h-[100px]"
  +                className="mt-1 min-h-[100px]"
  +                disabled={Boolean(segmentId)}
                 />
  -              <p className="text-xs text-muted-foreground mt-1">Вводите никнеймы через запятую или с новой строки</p>
  +              <p className="text-xs text-muted-foreground mt-1">
  +                {segmentId ? "Уберите выбранный сегмент, чтобы добавить список вручную" : "Вводите никнеймы через запятую или с новой строки"}
  +              </p>
  ```

### 5. Protected pages fire heavy queries before auth is confirmed (Severity: Medium)
- **Impact**: Every protected page (Dashboard, Parsing, Audience, Broadcast) calls React Query hooks that hit `/api/v1/*` before `<AuthGuard>` runs. When an unauthenticated user navigates to `/parsing` or `/broadcast`, the app spams `/parsing/history`, `/broadcast/history`, SSE endpoints, etc., receives 401s, and only then redirects to `/login`. Under slow/unstable networks (per ticket), this multiplies traffic and can trigger rate-limits.
- **Evidence**:
  - `useParsing()` is invoked at the top of `frontend/src/pages/Parsing.tsx` *before* the component returns `<AuthGuard>...`.
  - Same pattern exists in `Dashboard.tsx`, `Audience.tsx`, `Broadcast.tsx`.
  - Network log shows multiple 401s immediately after entering a protected URL while logged out.
- **Remediation**: Render the heavy content only after auth succeeds. Extract an inner component that uses the expensive hooks and wrap it with `<AuthGuard>` so hooks are never instantiated for guests.
- **Sample diff (Parsing page)**:
  ```diff
  -export default function Parsing() {
  -  const { toast } = useToast();
  -  const [query, setQuery] = useState("");
  -  const {
  -    history,
  -    ...
  -  } = useParsing();
  -  return (
  -    <AuthGuard>
  -      <Layout>...</Layout>
  -    </AuthGuard>
  -  );
  -}
  +function ParsingContent() {
  +  const { toast } = useToast();
  +  const [query, setQuery] = useState("");
  +  const parsing = useParsing();
  +  return <Layout>{/* existing JSX using `parsing` */}</Layout>;
  +}
  +
  +export default function Parsing() {
  +  return (
  +    <AuthGuard>
  +      <ParsingContent />
  +    </AuthGuard>
  +  );
  +}
  ```
  Apply the same pattern to Dashboard/Audience/Broadcast to prevent unauthorized fetch storms.

---

**Next steps**: once the above regressions are resolved, re-run the stress matrix (especially broadcasts) to confirm `JobTypes.BROADCAST` enqueues correctly, Telegram WebApp compliance tests pass, and unauthorized traffic is reduced.
