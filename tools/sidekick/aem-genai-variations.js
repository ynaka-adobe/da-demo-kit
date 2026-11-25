(function () {
  let isAEMGenAIVariationsAppLoaded = false;
  let isAEMGenAIVariationsAppLoading = false;
  const registeredSidekicks = new WeakSet();

  function loadAEMGenAIVariationsApp() {
    isAEMGenAIVariationsAppLoading = true;
    const script = document.createElement('script');
    script.src = 'https://experience.adobe.com/solutions/aem-sites-genai-aem-genai-variations-mfe/static-assets/resources/sidekick/client.js?source=plugin';
    script.onload = function () {
      isAEMGenAIVariationsAppLoaded = true;
      isAEMGenAIVariationsAppLoading = false;
    };
    script.onerror = function () {
      isAEMGenAIVariationsAppLoading = false;
      script.remove();
      console.error('Error loading AEMGenAIVariationsApp.');
    };
    document.head.appendChild(script);
  }

  function handlePluginButtonClick() {
    if (!isAEMGenAIVariationsAppLoaded && !isAEMGenAIVariationsAppLoading) {
      loadAEMGenAIVariationsApp();
    }
  }

  function registerSidekicks() {
    ['helix-sidekick', 'aem-sidekick'].forEach((selector) => {
      const sidekick = document.querySelector(selector);
      if (sidekick && !registeredSidekicks.has(sidekick)) {
        sidekick.addEventListener('custom:aem-genai-variations-sidekick', handlePluginButtonClick);
        registeredSidekicks.add(sidekick);
      }
    });
  }

  registerSidekicks();
  document.addEventListener('sidekick-ready', registerSidekicks);
}());
