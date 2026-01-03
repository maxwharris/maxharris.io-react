import './ProjectCard.css';

const ProjectCard = ({ title, description, link, image }) => {
  return (
    <div className="project-item">
      <a href={link} target="_blank" rel="noopener noreferrer" className="project-image">
        {image ? (
          <img src={image} alt={title} />
        ) : (
          <div className="project-placeholder">
            <span className="placeholder-icon">→</span>
          </div>
        )}
      </a>
      <div className="project-content">
        <h3>{title}</h3>
        <p>{description}</p>
        <a href={link} target="_blank" rel="noopener noreferrer" className="project-link">
          Visit Site →
        </a>
      </div>
    </div>
  );
};

export default ProjectCard;