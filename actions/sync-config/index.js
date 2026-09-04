/**
 * Sync entire DA config (library, apps, prepare, data sheets) from da-demo-kit to target repo.
 *
 * Usage:
 *   GET /actions/sync-config?targetOrg=my-org&targetRepo=my-site
 *
 * Auth (primary -> fallback), same token used for BOTH source read and target write —
 * valid as long as its identity is granted access in both orgs' `permissions` sheets
 * (read on da-demo-kit, write on the target). See actions/PROVISIONING.md.
 *   1. ?accessToken=...                      (explicit override, for testing)
 *   2. DA_TOKEN runtime secret               (a long-lived DA admin token)  <- primary
 *   3. IMS Server-to-Server minted token     (IMS_CLIENT_ID/SECRET/SCOPES)  <- fallback
 *
 * Env:
 *   DA_TOKEN                                   (long-lived DA admin token — primary path)
 *   IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES  (S2S fallback)
 *
 * Returns:
 *   { success: true, config: {...} }
 */

const CONFIG_API_BASE = 'https://admin.da.live/config';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

/**
 * The long-lived DA_Token, provided directly as a runtime secret (process.env.DA_TOKEN).
 *
 * We deliberately do NOT read it from da-demo-kit's `.da/adobe-da` DA sheet: that sheet is
 * DA content on admin.da.live, which itself requires a DA credential to read — i.e. the very
 * token we'd be bootstrapping (circular) — and it is not served on admin.hlx.page (404). So
 * DA_Token must be supplied as a runtime secret (`aio app deploy` picks it up from .env /
 * app config, or set it with `aio runtime action update`). Returns null if unset.
 */
function getDaToken() {
  return process.env.DA_TOKEN || null;
}

/**
 * Mint an IMS access token via the client_credentials (Server-to-Server) grant.
 * Returns null if S2S credentials aren't configured.
 */
async function getImsToken() {
  const clientId = process.env.IMS_CLIENT_ID;
  const clientSecret = process.env.IMS_CLIENT_SECRET;
  const scope = process.env.IMS_SCOPES;

  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (scope) body.append('scope', scope);

  const resp = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    throw new Error(`IMS token request failed: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  if (!json.access_token) {
    throw new Error('IMS token response had no access_token');
  }
  return json.access_token;
}

async function fetchConfig(org, repo, accessToken) {
  const url = `${CONFIG_API_BASE}/${org}/${repo}/?nocache=${Date.now()}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch config from ${org}/${repo}: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

async function pushConfig(org, repo, configData, accessToken) {
  const url = `${CONFIG_API_BASE}/${org}/${repo}/`;

  // Send config as a form parameter (not a JSON body)
  const formData = new URLSearchParams();
  formData.append('config', JSON.stringify(configData));

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Failed to push config to ${org}/${repo}: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

async function main(params) {
  // CORS preflight
  if (params.__ow_method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    };
  }

  const sourceOrg = 'ynaka-adobe';
  const sourceRepo = 'da-demo-kit';
  const targetOrg = params.targetOrg || params.org;
  const targetRepo = params.targetRepo || params.site || params.repo;

  if (!targetOrg || !targetRepo) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required parameters: targetOrg and targetRepo',
        example: '/actions/sync-config?targetOrg=my-org&targetRepo=my-site',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Auth resolution (primary -> fallback). The same token authorizes both the source
  // read and the target write, given its identity is granted access in both orgs'
  // `permissions` sheets (read on da-demo-kit, write on the target).
  //   1. ?accessToken=  (explicit override, for testing)
  //   2. DA_TOKEN runtime secret (a long-lived DA admin token)
  //   3. IMS Server-to-Server minted token (IMS_CLIENT_ID/SECRET/SCOPES)
  let token = params.accessToken;
  let authError = null;

  if (!token) {
    token = getDaToken(); // DA_TOKEN runtime secret (primary)
    if (!token) authError = 'DA_TOKEN not set';
  }

  if (!token) {
    try {
      token = await getImsToken(); // S2S fallback
    } catch (err) {
      authError = `IMS S2S: ${err.message}`;
    }
  }

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Missing authentication',
        detail: authError,
        solutions: [
          'Primary: set the DA_TOKEN runtime secret to a long-lived DA admin token',
          'Fallback: set IMS_CLIENT_ID / IMS_CLIENT_SECRET (and IMS_SCOPES) for the S2S technical account',
          'Grant the identity write on CONFIG in the target org\'s `permissions` sheet (see PROVISIONING.md)',
          'Or pass ?accessToken=YOUR_TOKEN to override for testing',
        ],
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };
  }

  try {
    // Fetch config from source, push to target — same S2S token for both.
    const sourceConfig = await fetchConfig(sourceOrg, sourceRepo, token);
    await pushConfig(targetOrg, targetRepo, sourceConfig, token);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Synced config from ${sourceOrg}/${sourceRepo} to ${targetOrg}/${targetRepo}`,
        source: { org: sourceOrg, repo: sourceRepo },
        target: { org: targetOrg, repo: targetRepo },
        config: sourceConfig,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        hint: 'A 401/403 here usually means the S2S identity lacks write on the target org\'s `permissions` sheet (CONFIG + content). See PROVISIONING.md.',
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };
  }
}

exports.main = main;
