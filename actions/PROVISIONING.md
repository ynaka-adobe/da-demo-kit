# Cross-org sync provisioning

`sync-config` and `sync-da-sheet` write configuration/content from `ynaka-adobe/da-demo-kit`
into a **target** org/site. When the target is a **different org**, the write needs a credential
with admin/write access to *that* org. The actions look it up as an env var:

```
TOKEN_<ORG uppercased, hyphens -> underscores>   # e.g. org "ynakagawa" -> TOKEN_YNAKAGAWA
```

If it isn't set, the actions fall back to da-demo-kit's own `ADMIN_API_KEY`, which **cannot**
write another org — so cross-org sync fails with a 401/403 on the push. That's the bug.

## One-time setup per target org

1. **Get admin on the target org.** Have the site owner add `ynaka@adobe.com` as an **admin**
   in the AEM Code Sync bot wizard's **Users** step (org-level covers all their sites). Only an
   admin can mint keys.

2. **Mint an org-level key** with `actions/provision-org-key.sh` (auth with your admin token in
   the environment — never in chat or on the command line):

   ```sh
   ADMIN_TOKEN=<your-admin-token> ./actions/provision-org-key.sh <target-org> admin
   # if you bootstrap with an existing API key instead of an IMS token:
   AUTH_HEADER="X-Auth-Token:" ADMIN_TOKEN=<api-key> ./actions/provision-org-key.sh <target-org> config,publish
   ```

   It calls `POST https://admin.hlx.page/config/<org>/apiKeys.json` and returns the key **once**.

3. **Store the key** on the da-demo-kit runtime (Adobe I/O Runtime / App Builder) as the env var
   the actions expect, e.g. `TOKEN_YNAKAGAWA=<key>`. No action code change is needed — the lookup
   is already there.

After that, `sync-config` / `sync-da-sheet` for that org authenticate with the stored key and the
cross-org write succeeds.

## Open item to verify (host split)

API keys are minted on **`admin.hlx.page`**. `sync-da-sheet` also uses `admin.hlx.page`, so the same
key should work there. `sync-config` writes to **`admin.da.live`** (a different host). Confirm with a
live test whether the `admin.hlx.page` key authorizes an `admin.da.live` config write. If it does not,
the config sync needs a **DA-scoped** token for the target org instead (same admin membership, DA's
own key/session) — mint/store that separately and have `sync-config` read it.

## Keys are per creation-level

Keys can be created org-, profile-, or site-level (`/config/<org>[/sites/<site>]/apiKeys.json`) and are
scoped to that level. Org-level is preferred (one key per teammate org). List with `GET …/apiKeys.json`
(metadata only — the secret is not returned again); delete with `DELETE …/apiKeys/<id>.json`.
