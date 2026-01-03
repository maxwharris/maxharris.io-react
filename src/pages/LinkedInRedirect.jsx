import { useEffect } from 'react';

const LinkedInRedirect = () => {
  useEffect(() => {
    window.location.href = 'https://www.linkedin.com/in/maxwilliamharris/';
  }, []);

  return null;
};

export default LinkedInRedirect;
