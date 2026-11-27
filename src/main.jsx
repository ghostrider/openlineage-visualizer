import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import MultiApp from './MultiApp';
import i18n from './i18n';
import { parseLineage } from './lineage';
import { IconBaseUrlContext } from './IntegrationIcon';
import './index.css';

// Apply a host-supplied locale (it wins); when absent the detector configured in
// ./i18n resolves the language (?lang / localStorage / navigator). See src/i18n.
function applyLocale(locale) {
  if (locale) i18n.changeLanguage(locale);
}

// ---- Single-mode (auto-mount) ----------------------------------------------
// Backwards-compatible: the embedded preview on the data product details page
// renders a single product's lineage by setting data-json-url on the container.

// `htmx:load` fires once per swapped-in element, so a host page with several
// htmx fragments re-runs auto-mount many times for the same container. Tracking
// the containers we already took keeps mounting idempotent — without it each
// swap issues another lineage fetch and calls createRoot on a live root.
const mountedContainers = new WeakSet();

// `data-file-drop` lets OpenLineage files dragged onto the browser window be added to the graph. With it the
// container mounts even without data-json-url, waiting for files to be dropped.
function fileDropEnabled(container) {
  const v = container.dataset.fileDrop;
  return v !== undefined && v !== 'false';
}

function mountSingle(container) {
  const jsonUrl = container.dataset.jsonUrl;
  const height = container.dataset.height || '400px';
  const fileDrop = fileDropEnabled(container);
  if (!jsonUrl && !fileDrop) return;
  if (mountedContainers.has(container)) return;
  mountedContainers.add(container);

  const load = jsonUrl
    ? fetch(jsonUrl, { credentials: 'same-origin' }).then((res) => res.text()).then(parseLineage)
    : Promise.resolve({ events: [] });

  load
    .then((initial) => {
      const empty = initial.graph ? initial.graph.length === 0 : initial.events.length === 0;
      if (empty && !fileDrop) return;
      container.style.height = height;
      applyLocale(container.dataset.locale);
      createRoot(container).render(
        <I18nextProvider i18n={i18n}>
          <IconBaseUrlContext.Provider value={container.dataset.iconBaseUrl || null}>
            <App initial={initial} fileDrop={fileDrop} />
          </IconBaseUrlContext.Provider>
        </I18nextProvider>,
      );
    })
    .catch((err) => {
      // Let a failed attempt be retried by a later swap rather than leaving the
      // container permanently marked as mounted.
      mountedContainers.delete(container);
      console.error('OpenLineage visualizer fetch error:', err);
    });
}

function autoMount(root = document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  // The swapped-in fragment may be the container itself or merely contain it.
  const container = scope instanceof Element && scope.id === 'openlineage-visualizer'
    ? scope
    : scope.querySelector('#openlineage-visualizer');
  if (!container) return;
  // Multi-mode is initialised explicitly via `init(config)`; auto-mount only
  // handles the single-mode embed via data-json-url or data-file-drop.
  if (!container.dataset.jsonUrl && !fileDropEnabled(container)) return;
  mountSingle(container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => autoMount(document));
} else {
  autoMount(document);
}

document.addEventListener('htmx:load', (event) => autoMount(event.target));

// ---- init(config) ----------------------------------------------------------
// Explicit initialiser used by the multi-product expanded page. Mirrors the
// datacontract-editor embed pattern: lookup data is passed in as `dataProducts`
// and per-product events are fetched through the `loadEvents` function or
// `eventsEndpoint` URL template.

const DEFAULTS = {
  container: '#openlineage-visualizer',
  mode: 'multi',
  dataProducts: [],
  currentProductExternalId: null,
  initialProducts: [],
  loadEvents: null,
  eventsEndpoint: null,
  height: 'calc(100vh - 44px)',
  locale: null,
  // Where the host serves platform icons as <key>.svg (e.g. '/assets/media/icons/'); null uses the inline glyphs.
  iconBaseUrl: null,
};

function resolveContainer(target) {
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`OpenLineage visualizer: container not found: ${target}`);
    return el;
  }
  if (target instanceof HTMLElement) return target;
  throw new Error('OpenLineage visualizer: container must be a selector string or HTMLElement');
}

function defaultLoadEvents(eventsEndpoint) {
  return (externalId, { signal } = {}) => {
    const url = eventsEndpoint.includes('{externalId}')
      ? eventsEndpoint.replace('{externalId}', encodeURIComponent(externalId))
      : `${eventsEndpoint}?productExternalId=${encodeURIComponent(externalId)}`;
    return fetch(url, { credentials: 'same-origin', signal })
      .then((res) => res.json());
  };
}

export function init(userConfig = {}) {
  const config = { ...DEFAULTS, ...userConfig };
  const container = resolveContainer(config.container);

  if (config.mode !== 'multi') {
    throw new Error(`OpenLineage visualizer: unsupported mode "${config.mode}"`);
  }
  const loadEvents = config.loadEvents || (config.eventsEndpoint ? defaultLoadEvents(config.eventsEndpoint) : null);
  if (!loadEvents) {
    throw new Error('OpenLineage visualizer: init() requires either loadEvents or eventsEndpoint');
  }

  container.style.height = config.height;
  applyLocale(config.locale);
  const root = createRoot(container);
  root.render(
    <I18nextProvider i18n={i18n}>
      <IconBaseUrlContext.Provider value={config.iconBaseUrl}>
        <MultiApp
          dataProducts={config.dataProducts}
          currentProductExternalId={config.currentProductExternalId}
          initialProducts={config.initialProducts}
          loadEvents={loadEvents}
        />
      </IconBaseUrlContext.Provider>
    </I18nextProvider>,
  );

  return {
    destroy() {
      root.unmount();
    },
  };
}
