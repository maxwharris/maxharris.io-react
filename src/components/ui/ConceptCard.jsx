import './ConceptCard.css';

const ConceptCard = ({ title, placeholder, tags, description, designApproach }) => {
  return (
    <div className={`concept-item concept-${designApproach}`}>
      <div className="concept-thumbnail">
        <span className="thumbnail-placeholder">{placeholder}</span>
        <div className="thumbnail-decoration"></div>
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