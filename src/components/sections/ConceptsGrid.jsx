import ConceptCard from '../ui/ConceptCard';
import { concepts } from '../../data/concepts';
import './ConceptsGrid.css';

const ConceptsGrid = ({ showTitle = true }) => {
  return (
    <section className="concepts">
      <div className="container">
        {showTitle && <h2 className="section-title">CONCEPTS & WORK IN PROGRESS</h2>}
        <div className="concepts-grid">
          {concepts.map((concept) => (
            <ConceptCard
              key={concept.id}
              title={concept.title}
              placeholder={concept.placeholder}
              tags={concept.tags}
              description={concept.description}
              designApproach={concept.designApproach}
              image={concept.image}
              link={concept.link}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ConceptsGrid;
