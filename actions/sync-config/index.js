/**
 * Sync entire DA config (library, apps, prepare, data sheets) from da-demo-kit to target repo.
 *
 * Usage:
 *   GET /actions/sync-config?targetOrg=my-org&targetRepo=my-site
 *
 * This syncs all config sheets in one call, ready for end users to use.
 *
 * Returns:
 *   { success: true, config: {...}, sheets: [...] }
 */

const CONFIG_API_BASE = 'https://admin.da.live/config';

async function fetchConfig(org, repo, accessToken) {
  const url = `${CONFIG_API_BASE}/${org}/${repo}/?nocache=${Date.now()}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch config: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

async function writeSheet(org, repo, sheetName, content, accessToken) {
  // Determine the file path based on sheet name
  let filePath = `${sheetName}.json`;
  if (sheetName.startsWith('.')) {
    // .da sheets are in .da/ directory
    filePath = `${sheetName}.json`;
  }

  const url = `https://admin.hlx.page/source/${org}/${repo}/${filePath}`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(content),
  });

  if (!resp.ok) {
    throw new Error(`Failed to write ${sheetName}: ${resp.status} ${resp.statusText}`);
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
    // Fetch entire config from source
    const sourceConfig = await fetchConfig(sourceOrg, sourceRepo, sourceToken);

    const sheetMap = sourceConfig.sheets || {};
    const syncedSheets = [];

    // Sync each sheet to target
    for (const [sheetName, sheetData] of Object.entries(sheetMap)) {
      try {
        await writeSheet(targetOrg, targetRepo, sheetName, sheetData, targetToken);
        syncedSheets.push(sheetName);
      } catch (err) {
        // Continue with other sheets even if one fails
        console.warn(`Failed to sync ${sheetName}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Synced ${syncedSheets.length} config sheet(s) from ${sourceOrg}/${sourceRepo} to ${targetOrg}/${targetRepo}`,
        source: { org: sourceOrg, repo: sourceRepo },
        target: { org: targetOrg, repo: targetRepo },
        sheets: {
          synced: syncedSheets,
          total: Object.keys(sheetMap).length,
        },
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
        hint: 'Ensure targetOrg/targetRepo have write access and ADMIN_API_KEY is valid',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
}

exports.main = main;
