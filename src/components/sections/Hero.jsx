import './Hero.css';

const Hero = ({ title, description }) => {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-content">
          <h1 className="hero-title">{title}</h1>
          <p className="hero-description">{description}</p>
        </div>
      </div>
    </section>
  );
};

export default Hero;
