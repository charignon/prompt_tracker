# Prompt Tracker

> Turn your Claude prompts into beautiful, interactive visualizations

Ever wonder what patterns emerge from your AI conversations? Prompt Tracker mines your Claude history and transforms it into stunning timeline visualizations, letting you explore, rate, and learn from every interaction.

## ✨ What Makes It Cool

**Interactive Timeline Visualization** - See your prompts flow across a 24-hour timeline with D3.js magic:
- 🎨 Color-coded by quality (green for gems, red for duds)
- 🔍 Zoom, pan, and filter by project
- 💫 Hover for previews, click for full details
- ⭐ Rate prompts directly in the UI

**Prompt Analytics** - Mine your conversation history:
- 📊 Track rating distributions and statistics
- 🔎 Full-text search across all prompts
- 📅 Filter by date ranges and projects
- 🏆 Find your best prompts instantly

**Knowledge Management** - Never lose a great prompt:
- 📝 Add notes and context to prompts
- 🔗 Publish to Memento for long-term storage
- 🎯 Tag and categorize for easy retrieval

## 🚀 Quick Start

```bash
# Install
git clone https://github.com/charignon/prompt_tracker.git
cd prompt_tracker
chmod +x prompt-tracker

# Sync your Claude history
./prompt-tracker sync

# Generate today's timeline (auto-opens in browser)
./prompt-tracker timeline 2025-10-02

# Rate your favorite prompts
./prompt-tracker rate 42 5
```

## 📸 Features

### Timeline Visualization
```bash
prompt-tracker timeline 2025-10-02
```
Creates an interactive HTML timeline showing:
- Every prompt as a bubble sized by length
- Color-coded quality indicators
- Project-based swim lanes
- Zoom/pan controls
- Rating widget in side panel

### Prompt Management
```bash
# List recent prompts
prompt-tracker list

# Search for specific topics
prompt-tracker list --search "docker"

# Find your best work
prompt-tracker list --min-rating 4

# Add context notes
prompt-tracker note 42 "Great debugging technique"
```

### Statistics
```bash
prompt-tracker stats
```
```
Total prompts: 1234
Rated prompts: 56
Average rating: 3.82

Rating distribution:
  ★☆☆☆☆   12 ████████████
  ★★★★★   10 ██████████
```

## 🎯 Use Cases

- **Learn from your best prompts** - Review 5-star prompts to spot patterns
- **Build a prompt library** - Export winners to Memento or your knowledge base
- **Track productivity** - Visualize when you're most productive with Claude
- **Debug prompt engineering** - Compare what works vs what doesn't

## 📦 Installation

Requires Python 3.7+ (no external dependencies for core functionality).

For visualizations, the timeline feature uses D3.js loaded from CDN - no local installation needed.

```bash
# Clone the repo
git clone https://github.com/charignon/prompt_tracker.git
cd prompt_tracker

# Make executable
chmod +x prompt-tracker

# Optional: add to PATH
ln -s $(pwd)/prompt-tracker ~/bin/prompt-tracker
```

## 🔧 Core Commands

| Command | Description |
|---------|-------------|
| `sync` | Import prompts from ~/.claude/history.jsonl |
| `list` | List prompts with filters |
| `rate <id> <1-5>` | Rate a prompt |
| `note <id> <text>` | Add note to prompt |
| `show <id>` | Show full prompt details |
| `stats` | Display statistics |
| `timeline <date>` | Generate interactive timeline |
| `publish <id>` | Export to Memento |

## 🎨 Word Cloud Generation

Bonus tools included for analyzing prompt language:

```bash
# Generate word cloud from prompts
python create_wordcloud.py

# Technical terms only
python create_technical_wordcloud.py
```

## 💾 Data Storage

- Prompts stored in SQLite at `~/.config/prompt_tracker/instance.db`
- Original `history.jsonl` is never modified
- All ratings and notes are local only

## 🤝 Contributing

Ideas for contributions:
- Export formats (Markdown, JSON, CSV)
- More visualization types (heatmaps, network graphs)
- AI-powered prompt clustering
- Prompt template extraction

## 📄 License

MIT

---

**Made with** ❤️ **for Claude Code users who want to learn from their AI conversations**
