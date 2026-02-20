import { useRef, useCallback } from 'react';
import CanvasItem from './CanvasItem';
import './Canvas.css';

const Canvas = ({ items, onMove, onDelete, onResize, pan, onPanChange }) => {
  const canvasRef = useRef(null);
  const panStart = useRef(null);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.target.closest('.canvas-item')) return;
      e.preventDefault();
      canvasRef.current.setPointerCapture(e.pointerId);
      panStart.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
      canvasRef.current.classList.add('panning');
    },
    [pan.x, pan.y]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!panStart.current) return;
      onPanChange({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
    },
    [onPanChange]
  );

  const handlePointerUp = useCallback(() => {
    if (!panStart.current) return;
    panStart.current = null;
    canvasRef.current.classList.remove('panning');
  }, []);

  return (
    <div
      ref={canvasRef}
      className="share-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="share-canvas-content"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {items.map((item) => (
          <CanvasItem
            key={item.id}
            item={item}
            onMove={onMove}
            onDelete={onDelete}
            onResize={onResize}
          />
        ))}
      </div>
    </div>
  );
};

export default Canvas;
