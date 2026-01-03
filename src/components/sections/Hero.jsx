import './Hero.css';

const Hero = ({ title, description, showLinks = false }) => {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-content">
          <h1 className="hero-title">{title}</h1>
          <p className="hero-description">{description}</p>
          {showLinks && (
            <div className="hero-links">
              <a href="https://github.com/maxwharris" target="_blank" rel="noopener noreferrer" className="hero-link">
                github
              </a>
              <a href="https://www.linkedin.com/in/maxwilliamharris/" target="_blank" rel="noopener noreferrer" className="hero-link">
                linkedin
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Hero;
