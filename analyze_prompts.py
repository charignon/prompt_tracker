#!/usr/bin/env python3
import json
from datetime import datetime
from collections import Counter
import re

# Read all prompts
prompts_in_range = []
all_words = []

# Define time range for today 12:20 PM - 1:20 PM (local time)
start_time = datetime(2025, 10, 2, 12, 20, 0)
end_time = datetime(2025, 10, 2, 13, 21, 0)

start_ts = int(start_time.timestamp() * 1000)
end_ts = int(end_time.timestamp() * 1000)

print(f"Looking for timestamps between {start_ts} and {end_ts}")
print(f"Time range: {start_time} to {end_time}\n")

with open('/Users/laurent/Downloads/history.jsonl', 'r') as f:
    for line in f:
        try:
            entry = json.loads(line)
            timestamp = entry.get('timestamp')
            display = entry.get('display', '')

            # Extract words from all prompts for word cloud
            # Remove special characters and split into words
            words = re.findall(r'\b[a-zA-Z]{3,}\b', display.lower())
            all_words.extend(words)

            # Check if in time range
            if start_ts <= timestamp < end_ts:
                dt = datetime.fromtimestamp(timestamp / 1000)
                prompts_in_range.append({
                    'time': dt.strftime('%Y-%m-%d %H:%M:%S'),
                    'prompt': display
                })
        except json.JSONDecodeError:
            continue

# Print prompts in time range
print("=" * 80)
print(f"PROMPTS FROM 12:20 PM - 1:20 PM TODAY ({len(prompts_in_range)} found)")
print("=" * 80)
for p in prompts_in_range:
    print(f"\n[{p['time']}]")
    print(p['prompt'])

# Generate word cloud data
print("\n" + "=" * 80)
print("WORD CLOUD (Top 50 words)")
print("=" * 80)

# Filter out common words
stop_words = {'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have',
              'but', 'not', 'are', 'you', 'can', 'all', 'will', 'one', 'about',
              'into', 'out', 'what', 'there', 'when', 'which', 'how', 'they',
              'been', 'were', 'was', 'has', 'had', 'who', 'why', 'where', 'more',
              'could', 'would', 'should', 'just', 'like', 'than', 'its', 'also',
              'some', 'then', 'only', 'over', 'such', 'our', 'their', 'these',
              'those', 'them', 'does', 'did'}

filtered_words = [w for w in all_words if w not in stop_words]
word_counts = Counter(filtered_words)

for word, count in word_counts.most_common(50):
    bar = '█' * min(count, 60)
    print(f"{word:20s} {count:4d} {bar}")

print(f"\n\nTotal words analyzed: {len(all_words)}")
print(f"Unique words: {len(word_counts)}")
