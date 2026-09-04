/**
 * Sync entire DA config (library, apps, prepare, data sheets) from da-demo-kit to target repo.
 *
 * Usage:
 *   GET /actions/sync-config?targetOrg=my-org&targetRepo=my-site
 *
 * Auth: mints its own IMS Server-to-Server (client_credentials) token from stored
 * credentials, and uses it for BOTH the source read and the target write. One token
 * works for both as long as the S2S technical-account identity is granted access in
 * each org's `permissions` config sheet (read on da-demo-kit, write on the target).
 * See actions/PROVISIONING.md.
 *
 * Required env (S2S technical account):
 *   IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES
 * Optional override for testing/attended runs:
 *   ?accessToken=... (skips minting)
 *
 * Returns:
 *   { success: true, config: {...} }
 */

const CONFIG_API_BASE = 'https://admin.da.live/config';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

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

  // Auth: caller-supplied token wins (testing/attended); otherwise mint an IMS
  // Server-to-Server token from stored credentials. The same token authorizes the
  // source read and the target write (given the S2S identity is granted access in
  // both orgs' `permissions` sheets).
  let token = params.accessToken;
  if (!token) {
    try {
      token = await getImsToken();
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `Could not mint IMS token: ${err.message}`,
          hint: 'Check IMS_CLIENT_ID / IMS_CLIENT_SECRET / IMS_SCOPES for the S2S technical account.',
        }),
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      };
    }
  }

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Missing authentication',
        solutions: [
          'Set IMS_CLIENT_ID / IMS_CLIENT_SECRET (and IMS_SCOPES) for the S2S technical account',
          'Grant that identity write on CONFIG in the target org\'s `permissions` sheet (see PROVISIONING.md)',
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
