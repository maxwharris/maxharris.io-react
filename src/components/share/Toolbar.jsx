import { Link } from 'react-router-dom';
import './Toolbar.css';

const Toolbar = ({ onAddText, connected, connectedUsers }) => {
  return (
    <div className="share-toolbar">
      <Link to="/" className="share-toolbar-logo">
        maxharris.io
      </Link>
      <div className="share-toolbar-actions">
        <button className="share-toolbar-btn" onClick={onAddText}>
          + text
        </button>
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
