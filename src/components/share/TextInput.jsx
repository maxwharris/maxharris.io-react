import { useState } from 'react';
import './TextInput.css';

const TextInput = ({ onSubmit, onCancel }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <div className="share-textinput-overlay" onClick={onCancel}>
      <form
        className="share-textinput"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <textarea
          className="share-textinput-area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="type something..."
          autoFocus
          rows={4}
        />
        <div className="share-textinput-actions">
          <button type="button" className="share-textinput-cancel" onClick={onCancel}>
            cancel
          </button>
          <button type="submit" className="share-textinput-submit" disabled={!text.trim()}>
            add
          </button>
        </div>
      </form>
    </div>
  );
};

export default TextInput;
