import ProjectCard from '../ui/ProjectCard';
import { completedProjects } from '../../data/projects';
import './ProjectsGrid.css';

const ProjectsGrid = () => {
  return (
    <section className="completed-projects">
      <div className="container">
        <h2 className="section-title">COMPLETED PROJECTS</h2>
        <div className="projects-grid">
          {completedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              title={project.title}
              description={project.description}
              link={project.link}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectsGrid;
