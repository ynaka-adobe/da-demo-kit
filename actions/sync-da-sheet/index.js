/**
 * Sync a DA sheet from source (da-demo-kit) to target repo.
 *
 * Usage:
 *   GET /actions/sync-da-sheet?targetOrg=my-org&targetRepo=my-site&sheetPath=.da/adobe-target.json
 *
 * Returns:
 *   { success: true, source: {...}, target: {...} }
 */

const DA_API_BASE = 'https://admin.hlx.page';

async function fetchSheet(org, repo, path, accessToken) {
  const url = `${DA_API_BASE}/source/${org}/${repo}${path.startsWith('/') ? path : '/' + path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

async function updateSheet(org, repo, path, content, accessToken) {
  const url = `${DA_API_BASE}/source/${org}/${repo}${path.startsWith('/') ? path : '/' + path}`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(content),
  });

  if (!resp.ok) {
    throw new Error(`Failed to update ${path}: ${resp.status} ${resp.statusText}`);
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
  const sheetPath = params.sheetPath || '.da/adobe-target.json';
  const targetOrg = params.targetOrg || params.org;
  const targetRepo = params.targetRepo || params.site || params.repo;

  if (!targetOrg || !targetRepo) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required parameters: targetOrg and targetRepo',
        example: '/actions/sync-da-sheet?targetOrg=my-org&targetRepo=my-site&sheetPath=.da/adobe-target.json',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Auth resolution (in order of priority):
  // 1. accessToken parameter (passed by caller)
  // 2. ADMIN_API_KEY env var (for da-demo-kit source)
  // 3. Per-org token from env (e.g., TOKEN_<ORG> for target repos)
  let sourceToken = params.accessToken || process.env.ADMIN_API_KEY;
  let targetToken = sourceToken;

  // If target is different org, try to use org-specific token
  if (targetOrg !== sourceOrg) {
    const orgTokenKey = `TOKEN_${targetOrg.toUpperCase().replace(/-/g, '_')}`;
    targetToken = process.env[orgTokenKey] || sourceToken;
  }

  if (!sourceToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Missing authentication',
        solutions: [
          'Pass accessToken query param: ?accessToken=YOUR_TOKEN',
          'Set ADMIN_API_KEY env var for da-demo-kit',
          `Set TOKEN_${targetOrg.toUpperCase().replace(/-/g, '_')} env var for target repo`,
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Fetch from source
    const sourceContent = await fetchSheet(sourceOrg, sourceRepo, sheetPath, sourceToken);

    // Write to target
    const targetContent = await updateSheet(targetOrg, targetRepo, sheetPath, sourceContent, targetToken);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Synced ${sheetPath} from ${sourceOrg}/${sourceRepo} to ${targetOrg}/${targetRepo}`,
        source: { org: sourceOrg, repo: sourceRepo, path: sheetPath },
        target: { org: targetOrg, repo: targetRepo, path: sheetPath },
        content: sourceContent,
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
        hint: 'Ensure targetOrg/targetRepo have write access and ADMIN_API_KEY is valid',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
}

exports.main = main;
