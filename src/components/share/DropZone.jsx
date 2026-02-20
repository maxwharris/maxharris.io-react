import './DropZone.css';

const DropZone = ({ active }) => {
  if (!active) return null;

  return (
    <div className="share-dropzone">
      <div className="share-dropzone-content">
        <p className="share-dropzone-text">drop files here</p>
      </div>
    </div>
  );
};

export default DropZone;
