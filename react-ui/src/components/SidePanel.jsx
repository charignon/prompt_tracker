import PropTypes from 'prop-types';
import './SidePanel.css';

const SidePanel = ({ prompt, onClose, onRate }) => {
  if (!prompt) return null;

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleStarClick = (rating) => {
    onRate(prompt.id, rating);
  };

  return (
    <div className="side-panel active">
      <div className="panel-content">
        <div className="panel-header">
          <div>
            <div className="prompt-id">Prompt #{prompt.id}</div>
            <div className="prompt-time">{formatDate(prompt.timestamp)}</div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="rating-selector">
          {[1, 2, 3, 4, 5].map(star => (
            <span
              key={star}
              className={`rating-star ${prompt.rating && star <= prompt.rating ? 'filled' : 'empty'}`}
              onClick={() => handleStarClick(star)}
            >
              {prompt.rating && star <= prompt.rating ? '★' : '☆'}
            </span>
          ))}
        </div>

        {prompt.project && (
          <div className="prompt-meta">
            <strong>Project:</strong> {prompt.project}
          </div>
        )}

        <div className="prompt-text">
          {prompt.display}
        </div>

        {prompt.note && (
          <div className="prompt-note">
            <strong>Note:</strong> {prompt.note}
          </div>
        )}
      </div>
    </div>
  );
};

SidePanel.propTypes = {
  prompt: PropTypes.shape({
    id: PropTypes.number.isRequired,
    timestamp: PropTypes.number.isRequired,
    display: PropTypes.string.isRequired,
    project: PropTypes.string,
    rating: PropTypes.number,
    note: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onRate: PropTypes.func.isRequired,
};

export default SidePanel;
