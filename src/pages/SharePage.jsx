import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSocket } from '../hooks/useSocket';
import { useCanvas } from '../hooks/useCanvas';
import { getPresignedUrl, uploadToS3 } from '../lib/api';
import Toolbar from '../components/share/Toolbar';
import DropZone from '../components/share/DropZone';
import Canvas from '../components/share/Canvas';
import TextInput from '../components/share/TextInput';
import './SharePage.css';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function getFileType(contentType) {
  if (IMAGE_TYPES.includes(contentType)) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  return 'file';
}

const SharePage = () => {
  const { socket, connected, connectedUsers } = useSocket();
  const { items, addItem, moveItem, resizeItem, deleteItem } = useCanvas(socket);
  const [dragging, setDragging] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimeout = useRef(null);

  useEffect(() => {
    if (uploading) {
      spinnerTimeout.current = setTimeout(() => setShowSpinner(true), 3000);
    } else {
      clearTimeout(spinnerTimeout.current);
      setShowSpinner(false);
    }
    return () => clearTimeout(spinnerTimeout.current);
  }, [uploading]);

  const uploadFiles = useCallback(
    async (files, baseX, baseY) => {
      setUploading(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const x = baseX + i * 30;
          const y = baseY + i * 30;

          try {
            const { uploadUrl, key, publicUrl, id } = await getPresignedUrl(
              file.name,
              file.type
            );

            await uploadToS3(uploadUrl, file);

            const item = {
              id,
              type: getFileType(file.type),
              x,
              y,
              s3Key: key,
              url: publicUrl,
              filename: file.name,
              contentType: file.type,
              createdAt: new Date().toISOString(),
            };

            addItem(item);
          } catch (err) {
            console.error('Upload failed:', err);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [addItem]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (e.currentTarget === e.target) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      uploadFiles(files, e.clientX - pan.x, e.clientY - 48 - pan.y);
    },
    [uploadFiles, pan.x, pan.y]
  );

  const handleAddFiles = useCallback(
    (files) => {
      const centerX = (window.innerWidth / 2 - 100) - pan.x;
      const centerY = (window.innerHeight / 2 - 50) - pan.y;
      uploadFiles(files, centerX, centerY);
    },
    [uploadFiles, pan.x, pan.y]
  );

  const handleAddText = useCallback(
    (text) => {
      const item = {
        id: uuidv4(),
        type: 'text',
        x: (window.innerWidth / 2 - 100) - pan.x,
        y: (window.innerHeight / 2 - 50) - pan.y,
        content: text,
        createdAt: new Date().toISOString(),
      };
      addItem(item);
      setShowTextInput(false);
    },
    [addItem, pan.x, pan.y]
  );

  return (
    <div
      className="share-page"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toolbar
        onAddText={() => setShowTextInput(true)}
        onAddFiles={handleAddFiles}
        connected={connected}
        connectedUsers={connectedUsers}
      />
      <DropZone active={dragging} />
      <Canvas items={items} onMove={moveItem} onDelete={deleteItem} onResize={resizeItem} pan={pan} onPanChange={setPan} />
      {showSpinner && (
        <div className="share-upload-spinner">
          <div className="share-upload-spinner-ring" />
        </div>
      )}
      {showTextInput && (
        <TextInput
          onSubmit={handleAddText}
          onCancel={() => setShowTextInput(false)}
        />
      )}
    </div>
  );
};

export default SharePage;
