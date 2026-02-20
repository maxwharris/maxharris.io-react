import { useState, useCallback } from 'react';
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

const SharePage = () => {
  const { socket, connected, connectedUsers } = useSocket();
  const { items, addItem, moveItem, deleteItem } = useCanvas(socket);
  const [dragging, setDragging] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);

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
    async (e) => {
      e.preventDefault();
      setDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const dropX = e.clientX;
      const dropY = e.clientY - 48; // offset for toolbar height

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const offsetX = dropX + i * 30;
        const offsetY = dropY + i * 30;

        try {
          const { uploadUrl, key, publicUrl, id } = await getPresignedUrl(
            file.name,
            file.type
          );

          await uploadToS3(uploadUrl, file);

          const isImage = IMAGE_TYPES.includes(file.type);

          const item = {
            id,
            type: isImage ? 'image' : 'file',
            x: offsetX,
            y: offsetY,
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
    },
    [addItem]
  );

  const handleAddText = useCallback(
    (text) => {
      const item = {
        id: uuidv4(),
        type: 'text',
        x: window.innerWidth / 2 - 100,
        y: window.innerHeight / 2 - 50,
        content: text,
        createdAt: new Date().toISOString(),
      };
      addItem(item);
      setShowTextInput(false);
    },
    [addItem]
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
        connected={connected}
        connectedUsers={connectedUsers}
      />
      <DropZone active={dragging} />
      <Canvas items={items} onMove={moveItem} onDelete={deleteItem} />
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
