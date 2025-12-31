import './ProjectCard.css';

const ProjectCard = ({ title, description, link }) => {
  return (
    <div className="project-item">
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
