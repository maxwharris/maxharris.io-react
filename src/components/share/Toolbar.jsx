import { useRef } from 'react';
import { Link } from 'react-router-dom';
import './Toolbar.css';

const Toolbar = ({ onAddText, onAddFiles, connected, connectedUsers }) => {
  const fileInputRef = useRef(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onAddFiles(files);
    }
    e.target.value = '';
  };

  return (
    <div className="share-toolbar">
      <Link to="/" className="share-toolbar-logo">
        maxharris.io
      </Link>
      <div className="share-toolbar-actions">
        <button className="share-toolbar-btn" onClick={onAddText}>
          + text
        </button>
        <button className="share-toolbar-btn" onClick={handleFileClick}>
          + file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <div className="share-toolbar-status">
          <span
            className={`share-status-dot ${connected ? 'connected' : ''}`}
          />
          <span className="share-status-text">
            {connected ? `${connectedUsers} online` : 'connecting...'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
