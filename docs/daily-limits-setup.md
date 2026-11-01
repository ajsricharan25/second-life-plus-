# Activate 3 daily AI actions per account

The code supports a shared, persistent daily allowance. **It is not active until the services below are connected and `DAILY_QUOTA_ENABLED=true` is deployed.** Your existing Groq/Tavily configuration remains in place.

Every signed-in account receives **3 AI actions per day**, resetting at **midnight India time (Asia/Kolkata)**. A new assessment, refresh, follow-up, cost estimate, comparison or shop brief each uses one action. Requests accepted for processing count even if a provider later fails or the visitor closes the page. Invalid inputs, unsigned requests and requests blocked by the daily limit do not start AI/search calls.

## 1. Create the sign-in app in Auth0

1. Open [Auth0](https://auth0.com/) and use an eligible **Free** account/tenant. This feature does not need paid Auth0 features.
2. In **Applications → Applications → Create Application**, name it **Second Life Plus** and choose **Single Page Application**.
3. Open that application's **Settings**. Copy its **Domain** and **Client ID**. You do not need a Client Secret.
4. Copy your current working Vercel app URL, for example `https://YOUR-WORKING-APP.vercel.app`. Use that exact origin in all three fields below, then save:
   - **Allowed Callback URLs**
   - **Allowed Logout URLs**
   - **Allowed Web Origins**
5. Under **Applications → APIs → Create API**, use **Second Life API** as the name, `https://second-life-api` as the **Identifier**, and **RS256** as the signing algorithm. This identifier is a label for access tokens, not a domain you need to buy.
6. Ensure your SPA is allowed to request tokens for that API. Enable a login connection for the SPA, such as Auth0's email/password database connection. Google sign-in is optional and has its own provider setup; it is not required here.

Use exact callback origins, not wildcard production URLs. For local development you can separately allow `http://localhost:5173` (or `http://127.0.0.1:5173`, matching the address you actually use). Preview deployments need their own allowed origins if you want to test sign-in there.

## 2. Create shared storage in Upstash

1. Open [Upstash](https://console.upstash.com/), choose **Redis**, and create a database on an eligible **Free** plan. Keep paid usage disabled; check the allowance shown in your account.
2. In the database details, find the **REST API** credentials.
3. Copy **UPSTASH_REDIS_REST_URL** and the **read/write UPSTASH_REDIS_REST_TOKEN**. The read-only token cannot reserve daily usage.

Use the same database for all deployments that should share the allowance. Redis stores only a hashed account identifier, the quota date and the request count, expiring at the next reset. It does not store device details, photos, report text, email addresses or access tokens.

## 3. Add these to your existing Vercel project

Open **Environment Variables** and add the following. Select **Production**; include Preview only for deployments whose sign-in URLs you configured above.

| Key                        | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `DAILY_QUOTA_ENABLED`      | `true`                                                             |
| `DAILY_AI_LIMIT`           | `3`                                                                |
| `AUTH0_DOMAIN`             | The Domain from your Auth0 SPA, such as `your-tenant.auth0.com`    |
| `AUTH0_CLIENT_ID`          | The Client ID from that SPA                                        |
| `AUTH0_AUDIENCE`           | `https://second-life-api` — exactly the API Identifier you created |
| `UPSTASH_REDIS_REST_URL`   | The HTTPS REST URL from Upstash                                    |
| `UPSTASH_REDIS_REST_TOKEN` | Its read/write REST token                                          |

Do not use a `VITE_` prefix for these variables or paste secret keys into GitHub/chat. `/api/access` returns only the three public Auth0 settings to the browser. Keep your existing `GROQ_API_KEY`, `GROQ_MODEL`, `REPAIR_AI_PROVIDER` and `TAVILY_API_KEY`.

Save and deploy the latest `main` commit in the same Vercel project.

## 4. Verify the live limit

1. Open the Ready deployment. Select **Sign in for AI** and create/sign in to an account. Allow the sign-in pop-up if the browser blocks it.
2. Check that it shows **3 of 3 AI requests left today**.
3. Run an assessment and two follow-up actions. The count should become **0 of 3**, and AI buttons should be disabled. Existing reports, downloads and direct searches remain usable.
4. Sign out and sign back in with the **same account**, or use another browser. The count must still be **0 of 3** for that day.
5. At midnight India time a new allowance becomes available. A different account has its own allowance.

An account limit is not proof that every account represents a different physical person. Multiple accounts can each obtain an allowance. This feature is also not an app-wide monthly spending cap; Groq, Tavily, Redis, Auth0 and Vercel account allowances still apply.

## If setup fails

- **Sign-in fails:** check the SPA Domain/Client ID, exact allowed origins, enabled login connection and API audience. Never put the Auth0 Client Secret into the browser.
- **Daily allowance cannot be checked:** verify the Redis REST URL, writable token and database allowance. Enabled quotas fail closed: storage failure does not allow unmetered AI calls or reset usage in local memory.
- **All visitors share one allowance:** check that each is signing in to their own account. The counter uses the server-verified token subject, not IP addresses or a user ID submitted in a form.
- **A failed AI action reduced the count:** accepted requests reserve a slot before search/model calls because failed calls may still consume provider quota. Reservations are not automatically retried or refunded.
- **No sign-in appears:** check `DAILY_QUOTA_ENABLED=true` in the environment used by the current deployment, then redeploy. Leaving it absent or `false` keeps the previous unrestricted AI flow; it does not enable a persistent limit.

Keep `DAILY_QUOTA_NAMESPACE` (default `second-life-plus`) stable across redeployments. Changing the namespace/database/identity issuer deliberately creates a separate allowance. Use a different namespace only for intentionally separate apps or test environments.
