# AEM Block Collection

This project provides a foundation for starting an AEM Edge Delivery Services project. It includes many common blocks and features a project might need.

## DA compatible

This specific repo has been _slightly_ modified to be compatible with DA's live preview.

## Getting started

### 1. Github
1. Use this template to make a new repo.
1. Install [AEM Code Sync](https://github.com/apps/aem-code-sync).

### 2. DA content
1. Browse to https://author.aem.live/start.
2. Follow the steps.

### 3. Local development
1. Clone your new repo to your computer.
1. Install the AEM CLI using your terminal: `sudo npm install -g @adobe/aem-cli`
1. Start the AEM CLI: `aem up`.
1. Open the `{repo}` folder in your favorite code editor and buil something.
1. **Recommended:** Install common npm packages like linting and testing: `npm i`.

### Linting

Run `npm ci` and `npm ci --prefix plugins/experimentation` to install the locked
dependencies for the site and the experimentation plugin's tests, then run
`npm run lint` (the same check used by CI). The distributed, minified Adobe Target
SDK is excluded; the maintained Target loader and all other JavaScript remain linted.
The DA SDK's browser URL is recognized as an external module. Marketo's stylesheet
also permits the `mkto...` class names emitted by its external Forms SDK; other
class names still follow the standard kebab-case rule.

### GenAI in Sidekick

The **Generate with AI** plugin uses Adobe's hosted AEM Generate Variations
Sidekick client, as in the Suresmile example. It is available on EDS **preview**
pages, including DA-authored paths without a `.docx` suffix; live and production
pages are unchanged. Install/configure AEM Sidekick for the new repository, open
its preview page, and click **Generate with AI**. The client loads on first click
and uses the current page URL, not a Suresmile or template-specific URL.

Registration is in `tools/sidekick/config.json`; `scripts/scripts.js` imports
`tools/sidekick/aem-genai-variations.js`, which handles both Sidekick generations.
Run `node --test tools/sidekick/aem-genai-variations.test.mjs` to check registration,
delayed Sidekick initialization, duplicate clicks, and load-failure retry.

Deploy these Git changes through AEM Code Sync before expecting the updated
button on a hosted site. Generation requires network access to
`experience.adobe.com`, Adobe sign-in, and access to AEM Generate Variations.
Its authenticated generation flow must be checked with an entitled account.
This integration does not add a DA editor **Apps** entry or modify DA configuration;
DA Apps are separately managed at `https://author.aem.live/config#/your-org/your-repo`.
No DA config sync, credential copying, or customer content is needed for this
preview Sidekick plugin.

### DA authoring host

Repository navigation, editor links, and config/sheet links use
`https://author.aem.live/`, preserving their existing paths and fragments.
The Sidekick **Document Authoring** link uses the current repository and page.
DA API/content endpoints (`admin.da.live`, `content.da.live`) and hosted SDK,
preview, and experimentation assets remain unchanged; this is an authoring UI
link migration, not a service migration. Existing author context is still supplied
by the DA SDK or Sidekick referrer, without a hard-coded author UI origin.

Embedded live preview from the new author host still needs a live-service check:
the hosted `dapreview.js` currently only permits the old DA author origin and
development origins. Changing its download host does not change that allowlist.
Git changes alone neither migrate DA configuration nor deploy the updated links.
