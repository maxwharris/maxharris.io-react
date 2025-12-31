import Hero from '../components/sections/Hero';
import ProjectsGrid from '../components/sections/ProjectsGrid';
import ConceptsGrid from '../components/sections/ConceptsGrid';

const Projects = () => {
  return (
    <>
      <Hero 
        title="PROJECTS"
        description="Completed work and concepts in development"
      />
      <ProjectsGrid />
      <ConceptsGrid />
    </>
  );
};

export default Projects;
