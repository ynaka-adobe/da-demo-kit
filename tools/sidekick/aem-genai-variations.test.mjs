/* eslint-env node */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./aem-genai-variations.js', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const plugin = config.plugins.find(({ id }) => id === 'aem-genai-variations');
const clickEvent = `custom:${plugin.event}`;

function createPage(selector, delayed = false) {
  const sidekick = new EventTarget();
  const document = new EventTarget();
  const scripts = [];
  const errors = [];
  let available = !delayed;
  document.querySelector = (name) => (available && name === selector ? sidekick : null);
  document.createElement = () => ({ remove() { scripts.splice(scripts.indexOf(this), 1); } });
  document.head = { appendChild(script) { scripts.push(script); } };
  runInNewContext(source, { document, console: { error: (message) => errors.push(message) } });
  return {
    scripts,
    errors,
    click() { sidekick.dispatchEvent(new Event(clickEvent)); },
    ready() {
      available = true;
      document.dispatchEvent(new Event('sidekick-ready'));
    },
  };
}

test('GenAI is registered for extensionless DA preview pages only', () => {
  assert.deepEqual(plugin.environments, ['preview']);
  assert.deepEqual(plugin.includePaths, ['**']);
});

['helix-sidekick', 'aem-sidekick'].forEach((selector) => {
  [false, true].forEach((delayed) => {
    test(`${selector}: ${delayed ? 'delayed' : 'existing'} registration and repeated clicks`, () => {
      const page = createPage(selector, delayed);
      assert.equal(page.scripts.length, 0);
      if (delayed) {
        page.click();
        assert.equal(page.scripts.length, 0);
        page.ready();
        page.ready();
      }
      page.click();
      page.click();
      assert.equal(page.scripts.length, 1);
      assert.equal(page.scripts[0].src, 'https://experience.adobe.com/solutions/aem-sites-genai-aem-genai-variations-mfe/static-assets/resources/sidekick/client.js?source=plugin');
      page.scripts[0].onload();
      page.click();
      assert.equal(page.scripts.length, 1);
      assert.deepEqual(page.errors, []);
    });
  });
});

test('a failed SDK load is reported and can be retried', () => {
  const page = createPage('aem-sidekick');
  page.click();
  page.scripts[0].onerror();
  assert.deepEqual(page.errors, ['Error loading AEMGenAIVariationsApp.']);
  assert.equal(page.scripts.length, 0);
  page.click();
  assert.equal(page.scripts.length, 1);
});
