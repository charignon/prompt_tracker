import { useMemo, useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import './Timeline.css';

const Timeline = ({ prompts, currentDate, onSelectPrompt, selectedPromptId }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [hoveredPrompt, setHoveredPrompt] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Group prompts by project for swim lanes
  const promptsByProject = useMemo(() => {
    const grouped = {};
    prompts.forEach(prompt => {
      const project = prompt.project || 'No Project';
      if (!grouped[project]) {
        grouped[project] = [];
      }
      grouped[project].push(prompt);
    });
    return grouped;
  }, [prompts]);

  // Calculate time range based on currentDate
  const timeRange = useMemo(() => {
    const selectedDate = new Date(currentDate);

    // Show the full day from 00:00 to 23:59
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
    const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

    // If this is today, extend end to 1 hour past current time
    const now = new Date();
    const isToday = selectedDate.getFullYear() === now.getFullYear() &&
                    selectedDate.getMonth() === now.getMonth() &&
                    selectedDate.getDate() === now.getDate();

    if (isToday) {
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      if (oneHourFromNow > end) {
        return { start, end: oneHourFromNow };
      }
    }

    return { start, end };
  }, [currentDate]);

  // Filter prompts to only show those in the current time range
  const visiblePromptsByProject = useMemo(() => {
    const filtered = {};
    const { start, end } = timeRange;
    const startTs = start.getTime();
    const endTs = end.getTime();

    Object.keys(promptsByProject).forEach(project => {
      const projectPrompts = promptsByProject[project].filter(p =>
        p.timestamp >= startTs && p.timestamp <= endTs
      );
      if (projectPrompts.length > 0) {
        filtered[project] = projectPrompts;
      }
    });

    return filtered;
  }, [promptsByProject, timeRange]);

  const projects = useMemo(() => Object.keys(visiblePromptsByProject).sort(), [visiblePromptsByProject]);

  // Convert timestamp to x position (0-100%)
  const getXPosition = (timestamp) => {
    const { start, end } = timeRange;
    const total = end.getTime() - start.getTime();
    const offset = timestamp - start.getTime();
    return (offset / total) * 100;
  };

  // Get rating color class
  const getRatingClass = (rating) => {
    if (!rating) return 'unrated';
    if (rating <= 2) return 'rating-low';
    if (rating === 3) return 'rating-medium';
    return 'rating-high';
  };

  // Calculate dot size based on prompt length (like D3 version)
  const getDotSize = (promptLength) => {
    const maxLength = Math.max(...prompts.map(p => p.display.length), 1000);
    // Square root scale from 8px to 40px (4px to 20px radius like D3)
    const minSize = 8;
    const maxSize = 40;
    const normalized = Math.sqrt(promptLength / maxLength);
    return Math.max(minSize, minSize + (maxSize - minSize) * normalized);
  };

  // Extract project name from full path
  const getProjectName = (projectPath) => {
    if (!projectPath) return 'No Project';
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  };

  // Format time for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Generate minimal time labels that span the actual time range
  const timeLabels = useMemo(() => {
    const { start, end } = timeRange;
    const totalMs = end.getTime() - start.getTime();
    const totalHours = totalMs / (1000 * 60 * 60);

    // Generate approximately 15-20 labels across the range (fewer to avoid crowding)
    const numLabels = Math.min(20, Math.max(10, Math.ceil(totalHours / 2)));
    const labels = [];

    for (let i = 0; i <= numLabels; i++) {
      const timestamp = start.getTime() + (totalMs * i / numLabels);
      const date = new Date(timestamp);

      // Minimal label: just M/D HH:MM
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = String(date.getHours()).padStart(2, '0');
      const mins = String(date.getMinutes()).padStart(2, '0');

      labels.push({
        timestamp,
        position: getXPosition(timestamp),
        label: `${month}/${day} ${hours}:${mins}`
      });
    }

    return labels;
  }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatFullDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handlePromptMouseEnter = (prompt, event) => {
    setHoveredPrompt(prompt);
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  };

  const handlePromptMouseLeave = () => {
    setHoveredPrompt(null);
  };

  // Handle wheel zoom
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.01;
      const newScale = Math.max(0.5, Math.min(5, scale + delta));
      setScale(newScale);
    }
  };

  // Handle drag to pan
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    });
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    containerRef.current.scrollLeft = dragStart.scrollLeft - dx;
    containerRef.current.scrollTop = dragStart.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="timeline-container"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <div
        className="timeline-content"
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        {/* Time axis */}
        <div className="time-axis">
          {timeLabels.map((tick, i) => (
            <div
              key={i}
              className="time-tick"
              style={{ left: `${tick.position}%` }}
            >
              <div className="time-label">{tick.label}</div>
            </div>
          ))}
        </div>

        {/* Swim lanes by project */}
        {projects.map((project, projectIndex) => (
          <div key={project} className="swim-lane">
            <div className="swim-lane-label" title={project}>
              {getProjectName(project)}
            </div>
            <div className="swim-lane-content">
              {visiblePromptsByProject[project].map(prompt => {
                const xPos = getXPosition(prompt.timestamp);
                const isSelected = prompt.id === selectedPromptId;
                const dotSize = getDotSize(prompt.display.length);

                return (
                  <div
                    key={prompt.id}
                    className={`prompt-dot ${getRatingClass(prompt.rating)} ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: `${xPos}%`,
                      width: `${dotSize}px`,
                      height: `${dotSize}px`
                    }}
                    onClick={() => onSelectPrompt(prompt)}
                    onMouseEnter={(e) => handlePromptMouseEnter(prompt, e)}
                    onMouseLeave={handlePromptMouseLeave}
                    title={formatFullDate(prompt.timestamp)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredPrompt && (
        <div
          className="tooltip"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="tooltip-time">{formatFullDate(hoveredPrompt.timestamp)}</div>
          <div className="tooltip-text">
            {hoveredPrompt.display.substring(0, 150)}
            {hoveredPrompt.display.length > 150 ? '...' : ''}
          </div>
          {hoveredPrompt.rating && (
            <div className="tooltip-rating">
              {'★'.repeat(hoveredPrompt.rating)}
              {'☆'.repeat(5 - hoveredPrompt.rating)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

Timeline.propTypes = {
  prompts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    timestamp: PropTypes.number.isRequired,
    display: PropTypes.string.isRequired,
    project: PropTypes.string,
    rating: PropTypes.number,
  })).isRequired,
  currentDate: PropTypes.string.isRequired,
  onSelectPrompt: PropTypes.func.isRequired,
  selectedPromptId: PropTypes.number,
};

export default Timeline;
