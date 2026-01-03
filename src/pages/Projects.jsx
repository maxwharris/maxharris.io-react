import Hero from '../components/sections/Hero';
import ProjectsGrid from '../components/sections/ProjectsGrid';
import ConceptsGrid from '../components/sections/ConceptsGrid';

const Projects = () => {
  return (
    <>
      <Hero 
        title="PROJECTS"
        description="completed work & works in progress"
      />
      <ProjectsGrid />
      <ConceptsGrid />
    </>
  );
};

export default Projects;
