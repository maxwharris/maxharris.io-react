import './ConceptCard.css';

const ConceptCard = ({ title, placeholder, tags, description, designApproach, image, link }) => {
  const cardContent = (
    <>
      <div className="concept-thumbnail">
        {image ? (
          <img src={image} alt={title} className="concept-image" />
        ) : (
          <>
            <span className="thumbnail-placeholder">{placeholder}</span>
            <div className="thumbnail-decoration"></div>
          </>
        )}
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
    </>
  );

  if (link) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={`concept-item concept-${designApproach}`}>
        {cardContent}
      </a>
    );
  }

  return (
    <div className={`concept-item concept-${designApproach}`}>
      {cardContent}
    </div>
  );
};

export default ConceptCard;