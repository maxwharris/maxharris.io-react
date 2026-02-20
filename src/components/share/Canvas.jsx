import CanvasItem from './CanvasItem';
import './Canvas.css';

const Canvas = ({ items, onMove, onDelete }) => {
  return (
    <div className="share-canvas">
      {items.map((item) => (
        <CanvasItem
          key={item.id}
          item={item}
          onMove={onMove}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default Canvas;
