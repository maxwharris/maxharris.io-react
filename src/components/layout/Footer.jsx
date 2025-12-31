import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-left">
            <p>© 2025 Max Harris</p>
          </div>
          <div className="footer-right">
            <a href="mailto:maxwilliamharris@gmail.com">EMAIL</a>
            <a href="https://github.com/maxwharris" target="_blank" rel="noopener noreferrer">
              GITHUB
            </a>
            <a href="https://www.linkedin.com/in/maxwilliamharris/" target="_blank" rel="noopener noreferrer">
              LINKEDIN
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
