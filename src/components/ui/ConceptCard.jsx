import './ConceptCard.css';

const ConceptCard = ({ title, placeholder, tags, description, gradient }) => {
  return (
    <div className="concept-item">
      <div className="concept-thumbnail" style={{ background: gradient }}>
        <span className="thumbnail-placeholder">{placeholder}</span>
      </div>
      <div className="concept-content">
        <h3>{title}</h3>
        <div className="concept-tags">
          {tags.map((tag, index) => (
            <span key={index} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <p>{description}</p>
      </div>
    </div>
  );
};

export default ConceptCard;
