# Context Growth Tracking Implementation

## Overview

This document outlines the implementation for tracking context growth per prompt in prompt_tracker, allowing you to identify which prompts cause massive context expansion.

## Architecture

### Data Flow
```
Claude Session Files (~/.claude/projects/)
    ↓
Context Enrichment Parser
    ↓
prompt_tracker Database (with context metrics)
    ↓
Analysis & Visualization Tools
```

### Components

1. **Context Enrichment Parser** (`context_enricher.py`)
   - Parses session `.jsonl` files
   - Correlates prompts with token usage
   - Calculates context growth deltas

2. **Database Schema Extension**
   - New table: `prompt_context_metrics`
   - Tracks token usage and context growth per prompt

3. **Analysis Commands**
   - `sync-context` - Enrich existing prompts with context data
   - `context-growth` - List prompts by context impact
   - `context-stats` - Show context usage statistics

4. **Enhanced Visualizations**
   - Color-coded timeline bubbles (by context growth)
   - Context growth charts
   - Session-level context evolution graphs

## Database Schema

### New Table: `prompt_context_metrics`

```sql
CREATE TABLE IF NOT EXISTS prompt_context_metrics (
    prompt_id INTEGER PRIMARY KEY,

    -- Token counts from usage data
    input_tokens INTEGER,              -- New tokens in this request
    cache_read_tokens INTEGER,         -- Tokens read from cache
    cache_creation_tokens INTEGER,     -- Tokens added to cache
    output_tokens INTEGER,             -- Tokens in response

    -- Context evolution
    context_before INTEGER,            -- Context size before prompt
    context_after INTEGER,             -- Context size after prompt
    context_growth INTEGER,            -- Delta: context_after - context_before
    context_growth_pct REAL,           -- Percentage growth

    -- Session info
    session_id TEXT,                   -- Claude session ID
    model TEXT,                        -- Model used

    -- Metadata
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

CREATE INDEX IF NOT EXISTS idx_context_growth ON prompt_context_metrics(context_growth DESC);
CREATE INDEX IF NOT EXISTS idx_session ON prompt_context_metrics(session_id);
```

## Implementation Files

### 1. Context Enricher (`context_enricher.py`)

```python
#!/usr/bin/env python3
"""
Context Enricher - Parse Claude session files and extract context metrics
"""

import json
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from datetime import datetime

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"

class ContextEnricher:
    def __init__(self):
        self.projects_dir = CLAUDE_PROJECTS_DIR

    def find_session_files(self, project_path: str) -> List[Path]:
        """Find all session .jsonl files for a project"""
        # Convert project path to Claude format
        # e.g., /Users/laurent/bin -> -Users-laurent-bin
        project_name = project_path.replace("/", "-")
        project_dir = self.projects_dir / project_name

        if not project_dir.exists():
            return []

        return list(project_dir.glob("*.jsonl"))

    def parse_session_file(self, session_file: Path) -> List[Dict]:
        """
        Parse a session file and extract all prompt/response pairs with usage data

        Returns list of entries with:
        - timestamp: prompt timestamp (ms)
        - session_id: Claude session ID
        - model: Model used
        - input_tokens: new input tokens
        - cache_read_tokens: cache read tokens
        - cache_creation_tokens: cache creation tokens
        - output_tokens: output tokens
        - context_size: total context size
        """
        entries = []

        try:
            with open(session_file, 'r') as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())

                        # Only process assistant responses with usage data
                        if entry.get('type') != 'assistant':
                            continue

                        message = entry.get('message', {})
                        usage = message.get('usage', {})

                        if not usage:
                            continue

                        # Parse timestamp
                        timestamp_str = entry.get('timestamp')
                        if not timestamp_str:
                            continue

                        # Convert ISO timestamp to milliseconds
                        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        timestamp_ms = int(dt.timestamp() * 1000)

                        # Calculate total context size
                        input_tokens = usage.get('input_tokens', 0)
                        cache_read = usage.get('cache_read_input_tokens', 0)
                        cache_creation = usage.get('cache_creation_input_tokens', 0)

                        context_size = input_tokens + cache_read + cache_creation

                        entries.append({
                            'timestamp': timestamp_ms,
                            'session_id': entry.get('sessionId', ''),
                            'model': message.get('model', ''),
                            'input_tokens': input_tokens,
                            'cache_read_tokens': cache_read,
                            'cache_creation_tokens': cache_creation,
                            'output_tokens': usage.get('output_tokens', 0),
                            'context_size': context_size
                        })

                    except (json.JSONDecodeError, ValueError, KeyError):
                        continue

        except Exception:
            return []

        # Sort by timestamp
        entries.sort(key=lambda x: x['timestamp'])

        # Calculate context growth for each entry
        for i in range(len(entries)):
            if i == 0:
                entries[i]['context_before'] = 0
            else:
                entries[i]['context_before'] = entries[i-1]['context_size']

            entries[i]['context_after'] = entries[i]['context_size']
            entries[i]['context_growth'] = entries[i]['context_after'] - entries[i]['context_before']

            if entries[i]['context_before'] > 0:
                entries[i]['context_growth_pct'] = (
                    entries[i]['context_growth'] / entries[i]['context_before'] * 100
                )
            else:
                entries[i]['context_growth_pct'] = 100.0 if entries[i]['context_growth'] > 0 else 0.0

        return entries

    def enrich_prompts(self, prompts: List[Dict], project_path: str) -> Dict[int, Dict]:
        """
        Enrich prompts with context metrics from session files

        Args:
            prompts: List of prompt dicts with 'id', 'timestamp', 'project' fields
            project_path: Project path to find session files

        Returns:
            Dict mapping prompt_id to context metrics
        """
        # Find session files for this project
        session_files = self.find_session_files(project_path)
        if not session_files:
            return {}

        # Parse all session files and collect metrics
        all_metrics = []
        for session_file in session_files:
            metrics = self.parse_session_file(session_file)
            all_metrics.extend(metrics)

        # Sort by timestamp for easier correlation
        all_metrics.sort(key=lambda x: x['timestamp'])

        # Match prompts to metrics by timestamp (within 5 second window)
        enriched = {}
        TIMESTAMP_WINDOW = 5000  # 5 seconds in milliseconds

        for prompt in prompts:
            prompt_ts = prompt['timestamp']
            prompt_id = prompt['id']

            # Find matching metric by timestamp
            best_match = None
            min_diff = float('inf')

            for metric in all_metrics:
                diff = abs(metric['timestamp'] - prompt_ts)
                if diff < min_diff and diff <= TIMESTAMP_WINDOW:
                    min_diff = diff
                    best_match = metric

            if best_match:
                enriched[prompt_id] = best_match

        return enriched
```

### 2. Enhanced PromptTracker Methods

Add these methods to the `PromptTracker` class in `prompt-tracker`:

```python
def _init_context_metrics_table(self):
    """Initialize context metrics table"""
    cursor = self.conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS prompt_context_metrics (
            prompt_id INTEGER PRIMARY KEY,
            input_tokens INTEGER,
            cache_read_tokens INTEGER,
            cache_creation_tokens INTEGER,
            output_tokens INTEGER,
            context_before INTEGER,
            context_after INTEGER,
            context_growth INTEGER,
            context_growth_pct REAL,
            session_id TEXT,
            model TEXT,
            synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prompt_id) REFERENCES prompts(id)
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_context_growth
        ON prompt_context_metrics(context_growth DESC)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_session
        ON prompt_context_metrics(session_id)
    """)

    self.conn.commit()

def sync_context_metrics(self, project_path: Optional[str] = None):
    """Sync context metrics from session files"""
    from context_enricher import ContextEnricher

    enricher = ContextEnricher()
    cursor = self.conn.cursor()

    # Get prompts to enrich
    if project_path:
        cursor.execute("""
            SELECT id, timestamp, project
            FROM prompts
            WHERE project = ?
            AND id NOT IN (SELECT prompt_id FROM prompt_context_metrics)
            ORDER BY timestamp ASC
        """, (project_path,))
    else:
        cursor.execute("""
            SELECT id, timestamp, project
            FROM prompts
            WHERE id NOT IN (SELECT prompt_id FROM prompt_context_metrics)
            ORDER BY timestamp ASC
        """)

    prompts = cursor.fetchall()

    if not prompts:
        return 0

    # Group prompts by project
    projects = {}
    for prompt in prompts:
        proj = prompt['project'] or ''
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(prompt)

    # Enrich each project
    enriched_count = 0
    for proj_path, proj_prompts in projects.items():
        if not proj_path:
            continue

        enriched = enricher.enrich_prompts(proj_prompts, proj_path)

        # Insert enriched metrics
        for prompt_id, metrics in enriched.items():
            cursor.execute("""
                INSERT OR REPLACE INTO prompt_context_metrics (
                    prompt_id, input_tokens, cache_read_tokens, cache_creation_tokens,
                    output_tokens, context_before, context_after, context_growth,
                    context_growth_pct, session_id, model
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                prompt_id,
                metrics['input_tokens'],
                metrics['cache_read_tokens'],
                metrics['cache_creation_tokens'],
                metrics['output_tokens'],
                metrics['context_before'],
                metrics['context_after'],
                metrics['context_growth'],
                metrics['context_growth_pct'],
                metrics['session_id'],
                metrics['model']
            ))
            enriched_count += 1

    self.conn.commit()
    return enriched_count

def list_by_context_growth(self, limit: int = 20, min_growth: Optional[int] = None) -> List:
    """List prompts sorted by context growth (highest first)"""
    cursor = self.conn.cursor()

    query = """
        SELECT p.id, p.timestamp, p.display, p.project,
               c.context_growth, c.context_growth_pct, c.context_before, c.context_after,
               c.input_tokens, c.cache_read_tokens, c.output_tokens,
               m.rating, m.note
        FROM prompts p
        INNER JOIN prompt_context_metrics c ON p.id = c.prompt_id
        LEFT JOIN prompt_metadata m ON p.id = m.prompt_id
        WHERE 1=1
    """
    params = []

    if min_growth:
        query += " AND c.context_growth >= ?"
        params.append(min_growth)

    query += " ORDER BY c.context_growth DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    return cursor.fetchall()

def get_context_stats(self, session_id: Optional[str] = None) -> Dict:
    """Get context usage statistics"""
    cursor = self.conn.cursor()

    if session_id:
        cursor.execute("""
            SELECT
                COUNT(*) as total_prompts,
                AVG(context_growth) as avg_growth,
                MAX(context_growth) as max_growth,
                SUM(context_growth) as total_growth,
                MAX(context_after) as peak_context
            FROM prompt_context_metrics
            WHERE session_id = ?
        """, (session_id,))
    else:
        cursor.execute("""
            SELECT
                COUNT(*) as total_prompts,
                AVG(context_growth) as avg_growth,
                MAX(context_growth) as max_growth,
                SUM(context_growth) as total_growth,
                MAX(context_after) as peak_context
            FROM prompt_context_metrics
        """)

    return dict(cursor.fetchone())
```

### 3. CLI Commands

Add these commands to `main()` in `prompt-tracker`:

```python
# Sync context command
sync_context_parser = subparsers.add_parser(
    'sync-context',
    help='Sync context metrics from session files'
)
sync_context_parser.add_argument(
    '--project',
    help='Only sync for specific project path'
)

# Context growth command
context_growth_parser = subparsers.add_parser(
    'context-growth',
    help='List prompts by context growth'
)
context_growth_parser.add_argument(
    '--limit',
    type=int,
    default=20,
    help='Number of prompts to show'
)
context_growth_parser.add_argument(
    '--min-growth',
    type=int,
    help='Minimum context growth in tokens'
)

# Context stats command
context_stats_parser = subparsers.add_parser(
    'context-stats',
    help='Show context usage statistics'
)
context_stats_parser.add_argument(
    '--session-id',
    help='Filter by session ID'
)

# ... in command handling ...

elif args.command == 'sync-context':
    count = tracker.sync_context_metrics(project_path=args.project)
    print(f"✓ Enriched {count} prompts with context metrics")

elif args.command == 'context-growth':
    prompts = tracker.list_by_context_growth(
        limit=args.limit,
        min_growth=args.min_growth
    )

    if not prompts:
        print("No prompts with context metrics found")
    else:
        print(f"\nTop prompts by context growth:\n")
        for p in prompts:
            dt = datetime.fromtimestamp(p['timestamp'] / 1000)
            growth_k = p['context_growth'] / 1000

            # Truncate display
            display = p['display'][:60]
            if len(p['display']) > 60:
                display += "..."

            print(f"[{p['id']:4d}] +{growth_k:5.1f}K tokens  {dt.strftime('%Y-%m-%d %H:%M')} - {display}")
            print(f"       Before: {p['context_before']:6d} → After: {p['context_after']:6d} ({p['context_growth_pct']:5.1f}% growth)")
            print()

elif args.command == 'context-stats':
    stats = tracker.get_context_stats(session_id=args.session_id)

    print(f"\nContext Usage Statistics:\n")
    print(f"Total prompts analyzed: {stats['total_prompts']}")
    print(f"Average growth per prompt: {stats['avg_growth']:.0f} tokens")
    print(f"Maximum growth (single prompt): {stats['max_growth']:,} tokens")
    print(f"Total context growth: {stats['total_growth']:,} tokens")
    print(f"Peak context size: {stats['peak_context']:,} tokens")
```

## Usage Examples

```bash
# 1. Sync prompts from history
prompt-tracker sync

# 2. Enrich prompts with context metrics
prompt-tracker sync-context

# 3. See which prompts caused massive context growth
prompt-tracker context-growth --limit 10

# Output:
# [ 142] +15.3K tokens  2025-10-17 10:30 - Help me refactor this entire codebase...
#        Before:  45000 → After:  60300 (34.0% growth)
#
# [ 156] +12.8K tokens  2025-10-17 11:15 - Read all files in src/ and analyze...
#        Before:  60300 → After:  73100 (21.2% growth)

# 4. Get context statistics for a session
prompt-tracker context-stats --session-id abc123

# 5. Filter by minimum growth
prompt-tracker context-growth --min-growth 10000  # Only show 10K+ growth
```

## Timeline Visualization Enhancement

Update `prompts_data` in timeline generation to include context metrics:

```javascript
// In generate_timeline_html and API endpoints
prompts_data.append({
    'id': p['id'],
    'timestamp': p['timestamp'],
    'display': p['display'],
    'project': p['project'],
    'rating': p['rating'],
    'note': p['note'],
    'context_growth': c['context_growth'] if c else null,
    'context_before': c['context_before'] if c else null,
    'context_after': c['context_after'] if c else null
})
```

Then update the D3 visualization to:
- Color bubbles by context growth (green → yellow → orange → red)
- Size bubbles by context impact
- Show context metrics in tooltips

## Integration with tmux-claude-cache-charts

The existing `tmux-claude-cache-charts` already displays real-time context usage. The prompt_tracker integration provides:

1. **Historical Analysis** - See which prompts historically caused issues
2. **Pattern Discovery** - Find common traits in high-growth prompts
3. **Learning** - Understand what makes prompts context-heavy
4. **Optimization** - Craft future prompts to minimize context growth

## Next Steps

1. Create `context_enricher.py` in prompt_tracker repo
2. Add context metrics table to database schema
3. Implement the new methods in PromptTracker class
4. Add CLI commands for context analysis
5. Enhance timeline visualization
6. Test on existing session data

This will give you a complete picture of context growth and help identify which prompts are context-heavy!
