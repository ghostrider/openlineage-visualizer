import { useEffect, useRef, useState } from 'react';

const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');

// Accept files dragged anywhere onto the browser window. Only drags that carry files are taken over, so dragging text
// or links on the host page behaves as before. Returns whether files are being dragged over the window.
export default function useFileDrop(onFiles, { enabled = true } = {}) {
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    if (!enabled) return undefined;
    // dragenter and dragleave fire for every element the pointer crosses; count them to know when it left the window.
    let depth = 0;
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      // Without this the browser opens the file instead of dropping it.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer.files || [])];
      if (files.length > 0) onFilesRef.current(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);

  return dragging;
}
