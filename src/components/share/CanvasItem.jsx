import { useRef, useCallback } from 'react';
import './CanvasItem.css';

const CanvasItem = ({ item, onMove, onDelete }) => {
  const itemRef = useRef(null);
  const dragState = useRef(null);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.target.closest('.canvas-item-delete')) return;
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
      if (!dragState.current) return;
      const x = e.clientX - dragState.current.startX;
      const y = e.clientY - dragState.current.startY;
      dragState.current = null;
      itemRef.current.classList.remove('dragging');
      onMove(item.id, x, y);
    },
    [item.id, onMove]
  );

  const renderContent = () => {
    if (item.type === 'image') {
      return <img src={item.url} alt={item.filename} className="canvas-item-img" />;
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
      return <div className="canvas-item-text">{item.content}</div>;
    }
    return null;
  };

  return (
    <div
      ref={itemRef}
      className="canvas-item"
      style={{ left: item.x, top: item.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {renderContent()}
      <button
        className="canvas-item-delete"
        onClick={() => onDelete(item.id)}
        title="Delete"
      >
        &times;
      </button>
    </div>
  );
};

export default CanvasItem;
