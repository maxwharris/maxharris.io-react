import { useEffect } from 'react';

const GitRedirect = () => {
  useEffect(() => {
    window.location.href = 'https://github.com/maxwharris';
  }, []);

  return null;
};

export default GitRedirect;
