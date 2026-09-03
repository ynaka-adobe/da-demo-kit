# Sync provisioning — credentials for cross-org sync

The sync actions touch **two different auth realms**, and one credential does **not** cover both (verified: a
`admin.hlx.page` key returns **401** on `admin.da.live`):

| What you sync | Endpoint / host | Auth |
|---|---|---|
| Content, `.da/*.json`, `docs/library` | DA **content sources** (`content.da.live`) | the DA connector / the user's own DA session — no key needed |
| **Config sheets** (data, library, apps, prepare) | **`admin.da.live/config`** (config store, `PUT`) | an **IMS Bearer token** — see below |

`admin.da.live` has **no durable API-key system** (no `/login`, no `apiKeys` endpoint, no `WWW-Authenticate`
challenge — it only accepts an IMS Bearer token). The da.live *session* token works but expires and can't be
scripted. So the **durable** credential for config writes is an **IMS OAuth Server-to-Server (S2S) technical
account**.

---

## Durable DA credential: IMS Server-to-Server

### 1. Create the S2S credential (once)

1. Go to the **Adobe Developer Console** → **Create new project**.
2. **Add API / credential** → **OAuth Server-to-Server**.
3. Save the credential's **Client ID**, **Client Secret**, **Technical Account email**, and the granted **Scopes**.

> ⚠️ Verify at setup: confirm the scopes/product profile actually authorize `admin.da.live`. DA is newer and may
> not appear as a first-class Console API — if a dedicated DA scope isn't offered, the token is still a valid IMS
> identity token, and DA authorizes it via the **permissions grant in step 2** (DA's model is identity-based, not
> scope-based). Test with the read in step 4 before relying on it.

### 2. Grant that identity `write` on the target org's config (per target org)

DA authorizes by **identity + path** in each org's **`permissions`** config sheet. The target org's owner opens
their org config in `da.live/config`, opens the **`permissions`** sheet, and adds two rows granting the credential's
identity `write`:

| path | groups | actions | comments |
|---|---|---|---|
| `CONFIG` | `<technical-account-email>` | `write` | The ability to set configurations for an org. |
| `/ + **` | `<technical-account-email>` | `write` | The ability to create content. |

Use the **Technical Account email** from step 1 as `groups` (for the attended/you-run case, use `ynaka@adobe.com`
instead — see the screenshot below, which shows exactly this granted to a real identity). Click **Save**.

**What a correct `permissions` sheet looks like:**

![DA config permissions — CONFIG + content write](assets/da-config-permissions.png)

> This is the whole "add an admin" step for DA — it's a row in the org's `permissions` sheet, not a separate UI.

### 3. Mint an IMS token from the S2S credential (headless, repeatable)

```bash
curl -sf -X POST https://ims-na1.adobelogin.com/ims/token/v3 \
  -d grant_type=client_credentials \
  -d "client_id=$IMS_CLIENT_ID" \
  -d "client_secret=$IMS_CLIENT_SECRET" \
  -d "scope=$IMS_SCOPES" | jq -r .access_token
```
(`$IMS_CLIENT_ID` / `$IMS_CLIENT_SECRET` / `$IMS_SCOPES` come from step 1 — keep them as env/secrets, never in
chat.) This returns a short-lived Bearer you fetch fresh whenever you need it — durable because the *credential* is
stored, not the token.

### 4. Use the token for the config PUT (and verify)

```bash
TOKEN=$(… step 3 …)
# verify auth first (should be 200 now that step 2 granted CONFIG write):
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  https://admin.da.live/config/<org>/<site>/
# then write:
curl -sf -X PUT "https://admin.da.live/config/<org>/<site>/" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "config@config.json"
```

The sync actions already accept a token (`accessToken` param / `ADMIN_API_KEY`) — feed the minted token there, or
store the S2S client id/secret on the runtime and have the action mint the token itself.

---

## Summary of who holds what

- **Content / sheets / library** → DA connector (the user's own session) → no credential to manage.
- **Config store** → IMS S2S technical account → its identity is granted `write` in each target org's `permissions`
  sheet (step 2) → the action/script mints a token (step 3) and PUTs config (step 4).
- The `admin.hlx.page` Site Admin key is still useful for **helix** ops (publish, source) but **not** for DA config.
