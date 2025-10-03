#!/usr/bin/env python3
import json
import re
from wordcloud import WordCloud
import matplotlib.pyplot as plt

# Read all prompts and extract words
all_text = []

with open('/Users/laurent/Downloads/history.jsonl', 'r') as f:
    for line in f:
        try:
            entry = json.loads(line)
            display = entry.get('display', '')
            all_text.append(display)
        except json.JSONDecodeError:
            continue

# Combine all text
combined_text = ' '.join(all_text)

# Common stop words to exclude
stop_words = {'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have',
              'but', 'not', 'are', 'you', 'can', 'all', 'will', 'one', 'about',
              'into', 'out', 'what', 'there', 'when', 'which', 'how', 'they',
              'been', 'were', 'was', 'has', 'had', 'who', 'why', 'where', 'more',
              'could', 'would', 'should', 'just', 'like', 'than', 'its', 'also',
              'some', 'then', 'only', 'over', 'such', 'our', 'their', 'these',
              'those', 'them', 'does', 'did', 'my', 'your', 'any', 'each', 'much',
              'very', 'so', 'if', 'or', 'be', 'as', 'at', 'by', 'an', 'is', 'to',
              'in', 'it', 'of', 'on', 'we', 'me'}

# Generate word cloud
wordcloud = WordCloud(
    width=1600,
    height=800,
    background_color='white',
    stopwords=stop_words,
    colormap='viridis',
    max_words=100,
    relative_scaling=0.5,
    min_font_size=10
).generate(combined_text)

# Create figure and save
plt.figure(figsize=(20, 10))
plt.imshow(wordcloud, interpolation='bilinear')
plt.axis('off')
plt.tight_layout(pad=0)
plt.savefig('/Users/laurent/Downloads/prompts_wordcloud.png', dpi=150, bbox_inches='tight')
print("Word cloud saved to: /Users/laurent/Downloads/prompts_wordcloud.png")
