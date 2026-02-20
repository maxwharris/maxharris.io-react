import { useState } from 'react';
import './Contact.css';

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState(null); // 'sending' | 'sent' | 'error'

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error();

      setStatus('sent');
      setForm({ name: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

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
          <form className="contact-form" onSubmit={handleSubmit}>
            <input
              className="contact-input"
              type="text"
              name="name"
              placeholder="name"
              value={form.name}
              onChange={handleChange}
              required
            />
            <input
              className="contact-input"
              type="email"
              name="email"
              placeholder="email"
              value={form.email}
              onChange={handleChange}
              required
            />
            <textarea
              className="contact-input contact-textarea"
              name="message"
              placeholder="message"
              value={form.message}
              onChange={handleChange}
              required
              rows={5}
            />
            <button
              className="contact-submit"
              type="submit"
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'sending...' : 'send message'}
            </button>
            {status === 'sent' && (
              <p className="contact-status contact-success">message sent!</p>
            )}
            {status === 'error' && (
              <p className="contact-status contact-error">
                failed to send. try emailing directly.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
