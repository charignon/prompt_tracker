import { useState, useEffect } from 'react';
import './App.css';
import Timeline from './components/Timeline';
import SidePanel from './components/SidePanel';
import Controls from './components/Controls';

function App() {
  const [prompts, setPrompts] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch prompts from the API
  useEffect(() => {
    const fetchPrompts = async () => {
      setLoading(true);
      try {
        // Calculate timestamp range for all prompts (we load all, like the D3 version)
        const response = await fetch('/api/prompts/all');
        if (!response.ok) {
          throw new Error('Failed to fetch prompts');
        }
        const data = await response.json();
        setPrompts(data.prompts || []);

        // Extract unique projects
        const uniqueProjects = [...new Set(
          data.prompts.map(p => p.project).filter(p => p && p.trim())
        )].sort();
        setProjects(uniqueProjects);
      } catch (error) {
        console.error('Error fetching prompts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrompts();
  }, []);

  // Filter prompts based on current filters
  const filteredPrompts = prompts.filter(prompt => {
    if (projectFilter && prompt.project !== projectFilter) {
      return false;
    }
    return true;
  });

  const handleRatePrompt = async (promptId, rating) => {
    try {
      const response = await fetch('/api/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt_id: promptId,
          rating: rating
        })
      });

      if (!response.ok) {
        throw new Error('Failed to rate prompt');
      }

      // Update local state
      setPrompts(prompts.map(p =>
        p.id === promptId ? { ...p, rating } : p
      ));

      if (selectedPrompt && selectedPrompt.id === promptId) {
        setSelectedPrompt({ ...selectedPrompt, rating });
      }
    } catch (error) {
      console.error('Error rating prompt:', error);
      alert('Failed to rate prompt');
    }
  };

  return (
    <div className="app">
      <div className="main-container">
        <div className="header">
          <h1>Prompt Timeline (React)</h1>
          <div className="stats">
            {filteredPrompts.length} prompts
            {projectFilter && ` in ${projectFilter}`}
          </div>
        </div>

        <Controls
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          projects={projects}
        />

        {loading ? (
          <div className="loading">Loading prompts...</div>
        ) : (
          <Timeline
            prompts={filteredPrompts}
            currentDate={currentDate}
            onSelectPrompt={setSelectedPrompt}
            selectedPromptId={selectedPrompt?.id}
          />
        )}
      </div>

      <SidePanel
        prompt={selectedPrompt}
        onClose={() => setSelectedPrompt(null)}
        onRate={handleRatePrompt}
      />
    </div>
  );
}

export default App;
