import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LineageCanvas from './LineageCanvas';
import useFileDrop from './useFileDrop';
import { openLineageToGraph, mergeGraphs, parseLineage } from './lineage';

// `initial` is what the container's data-json-url served: `{ graph }` or `{ events }`. With `fileDrop`, OpenLineage
// files dropped onto the browser window are added to it.
export default function App({ initial = { events: [] }, fileDrop = false }) {
  const { t } = useTranslation();
  // The files dropped so far: { name, events }.
  const [dropped, setDropped] = useState([]);
  const [notice, setNotice] = useState(null);

  const onFiles = useCallback(async (files) => {
    const added = [];
    const failed = [];
    let events = 0;
    for (const file of files) {
      try {
        const parsed = parseLineage(await file.text());
        if (parsed.graph) throw new Error('graph');
        if (parsed.events.length === 0) throw new Error('empty');
        added.push({ name: file.name, events: parsed.events });
        events += parsed.events.length;
      } catch {
        failed.push(file.name);
      }
    }
    if (added.length > 0) setDropped((prev) => [...prev, ...added]);
    setNotice({
      error: failed.length > 0,
      text: [
        added.length > 0 ? t('drop.added', { count: added.length, events }) : null,
        failed.length > 0 ? t('drop.failed', { names: failed.join(', ') }) : null,
      ].filter(Boolean).join(' '),
    });
  }, [t]);

  const dragging = useFileDrop(onFiles, { enabled: fileDrop });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const graph = useMemo(() => {
    const droppedEvents = dropped.flatMap((f) => f.events);
    if (initial.graph) {
      if (droppedEvents.length === 0) return initial.graph;
      return mergeGraphs([{ graph: initial.graph }, openLineageToGraph(droppedEvents)]).graph;
    }
    // Run all events through together so a job's latest run wins across files.
    return openLineageToGraph([...(initial.events || []), ...droppedEvents]).graph;
  }, [initial, dropped]);

  return (
    <div className="ol-app-root">
      {graph.length > 0 ? (
        <LineageCanvas graph={graph} />
      ) : (
        <div className="ol-empty">{fileDrop ? t('drop.empty') : t('drop.noLineage')}</div>
      )}
      {fileDrop && dropped.length > 0 && (
        <div className="ol-drop-status" title={dropped.map((f) => f.name).join('\n')}>
          <span>{t('drop.files', { count: dropped.length })}</span>
          <button type="button" onClick={() => setDropped([])}>{t('drop.clear')}</button>
        </div>
      )}
      {notice && (
        <div className={`ol-drop-notice${notice.error ? ' ol-drop-notice-error' : ''}`} role="status">
          {notice.text}
        </div>
      )}
      {dragging && (
        <div className="ol-drop-overlay">
          <div className="ol-drop-overlay-box">{t('drop.hint')}</div>
        </div>
      )}
    </div>
  );
}
