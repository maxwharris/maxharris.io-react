import { useRef, useCallback } from 'react';
import PdfViewer from './PdfViewer';
import './CanvasItem.css';

const URL_REGEX = /(https?:\/\/[^\s]+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|org|net|io|dev|co|me|app|edu|gov|ai|tv|gg|ly|fm|sh|uk|ca|de|fr|jp|eu|tech|xyz|info|biz)[^\s]*)/gi;

function linkifyText(text) {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = /^https?:\/\//.test(part) ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="canvas-item-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

const CanvasItem = ({ item, onMove, onDelete, onResize }) => {
  const itemRef = useRef(null);
  const dragState = useRef(null);
  const resizeState = useRef(null);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.target.closest('.canvas-item-delete') || e.target.closest('.canvas-item-download') || e.target.closest('.pdf-controls') || e.target.closest('.canvas-item-link') || e.target.closest('.canvas-item-resize')) return;
      e.preventDefault();
      const el = itemRef.current;
      el.setPointerCapture(e.pointerId);

      dragState.current = {
        startX: e.clientX - item.x,
        startY: e.clientY - item.y,
      };

      el.classList.add('dragging');
    },
    [item.x, item.y]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (resizeState.current) {
        const deltaX = e.clientX - resizeState.current.startX;
        const newScale = resizeState.current.startScale *
          (resizeState.current.startWidth + deltaX) / resizeState.current.startWidth;
        const clamped = Math.max(0.25, Math.min(4, newScale));
        itemRef.current.style.transform = `scale(${clamped})`;
        resizeState.current.currentScale = clamped;
        return;
      }
      if (!dragState.current) return;
      const x = e.clientX - dragState.current.startX;
      const y = e.clientY - dragState.current.startY;
      const el = itemRef.current;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    },
    []
  );

  const handlePointerUp = useCallback(
    (e) => {
      if (resizeState.current) {
        const scale = resizeState.current.currentScale ?? resizeState.current.startScale;
        resizeState.current = null;
        onResize(item.id, scale);
        return;
      }
      if (!dragState.current) return;
      const x = e.clientX - dragState.current.startX;
      const y = e.clientY - dragState.current.startY;
      dragState.current = null;
      itemRef.current.classList.remove('dragging');
      onMove(item.id, x, y);
    },
    [item.id, onMove, onResize]
  );

  const handleResizeDown = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      const el = itemRef.current;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      resizeState.current = {
        startX: e.clientX,
        startWidth: rect.width,
        startScale: item.scale || 1,
        currentScale: item.scale || 1,
      };
    },
    [item.scale]
  );

  const renderContent = () => {
    if (item.type === 'image') {
      return <img src={item.url} alt={item.filename} className="canvas-item-img" />;
    }
    if (item.type === 'pdf') {
      return <PdfViewer url={item.url} />;
    }
    if (item.type === 'file') {
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="canvas-item-file"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="canvas-item-file-icon">&#128196;</span>
          <span className="canvas-item-file-name">{item.filename}</span>
        </a>
      );
    }
    if (item.type === 'text') {
      return <div className="canvas-item-text">{linkifyText(item.content)}</div>;
    }
    return null;
  };

  const hasUrl = item.url && item.type !== 'text';

  const handleDownload = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      window.open(item.url, '_blank');
    }
  };

  const scale = item.scale || 1;

  return (
    <div
      ref={itemRef}
      className="canvas-item"
      style={{ left: item.x, top: item.y, transform: `scale(${scale})` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {renderContent()}
      {hasUrl && (
        <button
          className="canvas-item-download"
          onClick={handleDownload}
          title="Download"
        >
          &#8595;
        </button>
      )}
      <button
        className="canvas-item-delete"
        onClick={() => onDelete(item.id)}
        title="Delete"
      >
        &times;
      </button>
      <div
        className="canvas-item-resize"
        onPointerDown={handleResizeDown}
      />
    </div>
  );
};

export default CanvasItem;
