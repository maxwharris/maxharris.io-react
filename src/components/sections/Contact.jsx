import './Contact.css';

const Contact = () => {
  return (
    <section id="contact" className="contact">
      <div className="container">
        <h2 className="section-title">GET IN TOUCH</h2>
        <div className="contact-content">
          <div className="contact-info">
            <p>feel free to email me about anything</p>
            <a href="mailto:maxwilliamharris@gmail.com" className="contact-email">
              maxwilliamharris@gmail.com
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
