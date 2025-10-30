import PropTypes from 'prop-types';
import './Controls.css';

const Controls = ({ currentDate, onDateChange, projectFilter, onProjectFilterChange, projects }) => {
  const handlePrevDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    onDateChange(date.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    onDateChange(date.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    onDateChange(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="controls">
      <div className="control-group">
        <label className="control-label">Date:</label>
        <button className="date-nav-btn" onClick={handlePrevDay}>←</button>
        <input
          type="date"
          id="date-input"
          value={currentDate}
          onChange={(e) => onDateChange(e.target.value)}
        />
        <button className="date-nav-btn" onClick={handleNextDay}>→</button>
        <button className="date-nav-btn" onClick={handleToday}>Today</button>
      </div>

      <div className="control-group">
        <label className="control-label">Project:</label>
        <select
          id="project-filter"
          value={projectFilter}
          onChange={(e) => onProjectFilterChange(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map(project => (
            <option key={project} value={project}>{project}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

Controls.propTypes = {
  currentDate: PropTypes.string.isRequired,
  onDateChange: PropTypes.func.isRequired,
  projectFilter: PropTypes.string.isRequired,
  onProjectFilterChange: PropTypes.func.isRequired,
  projects: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default Controls;
