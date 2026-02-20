import { getAllItems, addItem, moveItem, deleteItem } from '../services/shareStore.js';
import { deleteFile } from '../services/s3.js';

export function setupShareSocket(io) {
  io.on('connection', (socket) => {
    // Send current state to newly connected client
    socket.emit('canvas:init', getAllItems());

    // Client can request init again (handles race condition)
    socket.on('canvas:request-init', () => {
      socket.emit('canvas:init', getAllItems());
    });

    // Broadcast connected user count
    io.emit('users:count', io.engine.clientsCount);

    // Client added a new item
    socket.on('item:add', (item) => {
      addItem(item);
      socket.broadcast.emit('item:added', item);
    });

    // Client moved an item
    socket.on('item:move', ({ id, x, y }) => {
      moveItem(id, x, y);
      socket.broadcast.emit('item:moved', { id, x, y });
    });

    // Client deleted an item
    socket.on('item:delete', async ({ id }) => {
      const items = getAllItems();
      const item = items.find((i) => i.id === id);

      if (item?.s3Key) {
        try {
          await deleteFile(item.s3Key);
        } catch (err) {
          console.error('S3 delete error:', err);
        }
      }

      deleteItem(id);
      socket.broadcast.emit('item:deleted', { id });
    });

    socket.on('disconnect', () => {
      io.emit('users:count', io.engine.clientsCount);
    });
  });
}
