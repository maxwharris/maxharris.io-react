import { useEffect } from 'react';
import Hero from '../components/sections/Hero';
import About from '../components/sections/About';
import Contact from '../components/sections/Contact';

const Home = () => {
  useEffect(() => {
    // Scroll to section if hash is present
    if (window.location.hash) {
      const id = window.location.hash.substring(1);
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, []);

  return (
    <>
      <Hero
        title={`max harris
developer+`}
        description="creating digital solutions and more"
        showLinks={true}
      />
      <About />
      <Contact />
    </>
  );
};

export default Home;
