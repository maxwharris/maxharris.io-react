import { useEffect, useState, useCallback } from 'react';

export function useCanvas(socket) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!socket) return;

    socket.on('canvas:init', (data) => {
      setItems(data);
    });

    socket.on('item:added', (item) => {
      setItems((prev) => [...prev, item]);
    });

    socket.on('item:moved', ({ id, x, y }) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, x, y } : item))
      );
    });

    socket.on('item:deleted', ({ id }) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    });

    return () => {
      socket.off('canvas:init');
      socket.off('item:added');
      socket.off('item:moved');
      socket.off('item:deleted');
    };
  }, [socket]);

  const addItem = useCallback(
    (item) => {
      setItems((prev) => [...prev, item]);
      socket?.emit('item:add', item);
    },
    [socket]
  );

  const moveItem = useCallback(
    (id, x, y) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, x, y } : item))
      );
      socket?.emit('item:move', { id, x, y });
    },
    [socket]
  );

  const deleteItem = useCallback(
    (id) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      socket?.emit('item:delete', { id });
    },
    [socket]
  );

  return { items, addItem, moveItem, deleteItem };
}
