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

# Comprehensive list of common English words to exclude
# Focus on keeping technical terms
stop_words = {
    # Articles, pronouns, determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
    'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'us', 'them',
    'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
    'each', 'every', 'either', 'neither', 'both', 'few', 'many', 'much', 'more',
    'most', 'some', 'any', 'all', 'several', 'enough', 'such',

    # Common verbs
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'should', 'could',
    'might', 'must', 'can', 'may', 'shall', 'ought', 'get', 'got', 'getting',
    'make', 'made', 'making', 'go', 'going', 'went', 'gone', 'come', 'came',
    'coming', 'take', 'took', 'taken', 'taking', 'give', 'gave', 'given', 'giving',
    'put', 'see', 'saw', 'seen', 'seeing', 'know', 'knew', 'known', 'knowing',
    'think', 'thought', 'thinking', 'say', 'said', 'saying', 'tell', 'told',
    'telling', 'find', 'found', 'finding', 'become', 'became', 'becoming',
    'leave', 'left', 'leaving', 'feel', 'felt', 'feeling', 'seem', 'seemed',
    'seeming', 'turn', 'turned', 'turning', 'keep', 'kept', 'keeping',
    'begin', 'began', 'begun', 'beginning', 'start', 'started', 'starting',
    'show', 'showed', 'shown', 'showing', 'hear', 'heard', 'hearing',
    'play', 'played', 'playing', 'move', 'moved', 'moving', 'like', 'liked',
    'liking', 'live', 'lived', 'living', 'believe', 'believed', 'believing',
    'bring', 'brought', 'bringing', 'happen', 'happened', 'happening',
    'write', 'wrote', 'written', 'writing', 'sit', 'sat', 'sitting',
    'stand', 'stood', 'standing', 'lose', 'lost', 'losing', 'pay', 'paid',
    'paying', 'meet', 'met', 'meeting', 'include', 'included', 'including',
    'continue', 'continued', 'continuing', 'set', 'setting', 'learn', 'learned',
    'learning', 'change', 'changed', 'changing', 'lead', 'led', 'leading',
    'understand', 'understood', 'understanding', 'watch', 'watched', 'watching',
    'follow', 'followed', 'following', 'stop', 'stopped', 'stopping',
    'create', 'created', 'creating', 'speak', 'spoke', 'spoken', 'speaking',
    'read', 'reading', 'allow', 'allowed', 'allowing', 'add', 'added', 'adding',
    'spend', 'spent', 'spending', 'grow', 'grew', 'grown', 'growing',
    'open', 'opened', 'opening', 'walk', 'walked', 'walking', 'win', 'won',
    'winning', 'offer', 'offered', 'offering', 'remember', 'remembered',
    'remembering', 'love', 'loved', 'loving', 'consider', 'considered',
    'considering', 'appear', 'appeared', 'appearing', 'buy', 'bought', 'buying',
    'wait', 'waited', 'waiting', 'serve', 'served', 'serving', 'die', 'died',
    'dying', 'send', 'sent', 'sending', 'expect', 'expected', 'expecting',
    'build', 'built', 'building', 'stay', 'stayed', 'staying', 'fall', 'fell',
    'fallen', 'falling', 'cut', 'cutting', 'reach', 'reached', 'reaching',
    'kill', 'killed', 'killing', 'remain', 'remained', 'remaining', 'suggest',
    'suggested', 'suggesting', 'raise', 'raised', 'raising', 'pass', 'passed',
    'passing', 'sell', 'sold', 'selling', 'require', 'required', 'requiring',
    'report', 'reported', 'reporting', 'decide', 'decided', 'deciding',
    'pull', 'pulled', 'pulling',

    # Common adjectives/adverbs
    'good', 'new', 'old', 'great', 'high', 'small', 'large', 'big', 'long',
    'little', 'own', 'other', 'last', 'right', 'wrong', 'left', 'same', 'different',
    'early', 'young', 'important', 'public', 'bad', 'able', 'better', 'best',
    'worse', 'worst', 'less', 'least', 'more', 'most', 'next', 'previous',
    'first', 'second', 'third', 'last', 'final', 'only', 'main', 'certain',
    'sure', 'clear', 'possible', 'likely', 'unable', 'available', 'free',
    'real', 'true', 'false', 'full', 'whole', 'entire', 'total', 'general',
    'specific', 'particular', 'special', 'common', 'nice', 'fine', 'hard',
    'easy', 'simple', 'difficult', 'happy', 'sad', 'sorry', 'glad', 'ready',
    'late', 'recent', 'current', 'past', 'future', 'present', 'human', 'short',
    'wide', 'deep', 'low', 'strong', 'weak', 'heavy', 'light', 'dark', 'bright',
    'clean', 'dirty', 'hot', 'cold', 'warm', 'cool', 'fast', 'slow', 'quick',
    'quiet', 'loud', 'soft', 'hard', 'smooth', 'rough', 'wet', 'dry', 'sick',
    'healthy', 'rich', 'poor', 'cheap', 'expensive', 'pretty', 'ugly', 'beautiful',
    'very', 'too', 'so', 'quite', 'rather', 'pretty', 'fairly', 'really', 'just',
    'almost', 'only', 'even', 'also', 'still', 'already', 'yet', 'never', 'always',
    'often', 'sometimes', 'usually', 'rarely', 'seldom', 'ever', 'again', 'once',
    'twice', 'now', 'then', 'here', 'there', 'everywhere', 'anywhere', 'somewhere',
    'nowhere', 'today', 'tomorrow', 'yesterday', 'tonight', 'ago', 'later', 'soon',
    'well', 'perhaps', 'maybe', 'probably', 'definitely', 'certainly', 'absolutely',

    # Prepositions and conjunctions
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as',
    'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against',
    'during', 'without', 'before', 'under', 'around', 'among', 'throughout',
    'despite', 'towards', 'upon', 'concerning', 'off', 'beyond', 'plus',
    'except', 'but', 'up', 'down', 'within', 'along', 'following', 'across',
    'behind', 'below', 'beside', 'besides', 'near', 'since', 'above', 'per',
    'and', 'or', 'but', 'nor', 'yet', 'so', 'if', 'because', 'while', 'when',
    'where', 'what', 'which', 'who', 'whom', 'whose', 'whether', 'than',
    'although', 'though', 'unless', 'until', 'till', 'whereas', 'whereby',

    # Question words
    'how', 'why', 'when', 'where', 'what', 'which', 'who', 'whom', 'whose',

    # Negatives and affirmatives
    'no', 'not', 'yes', 'yeah', 'yep', 'nope', 'none', 'nothing', 'nobody',
    'nowhere', 'neither', 'nor',

    # Other common words
    'want', 'need', 'try', 'trying', 'tried', 'way', 'time', 'thing', 'things',
    'something', 'anything', 'everything', 'nothing', 'someone', 'anyone',
    'everyone', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'hundred', 'thousand', 'million', 'billion', 'lot', 'lots',
    'bit', 'piece', 'part', 'number', 'amount', 'kind', 'type', 'sort', 'day',
    'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'hour', 'hours',
    'minute', 'minutes', 'second', 'seconds', 'people', 'person', 'man', 'men',
    'woman', 'women', 'child', 'children', 'guy', 'guys', 'place', 'places',
    'area', 'areas', 'side', 'sides', 'case', 'cases', 'fact', 'facts', 'hand',
    'hands', 'eye', 'eyes', 'head', 'face', 'back', 'front', 'top', 'bottom',
    'end', 'ends', 'point', 'points', 'group', 'groups', 'level', 'levels',
    'order', 'form', 'forms', 'line', 'lines', 'word', 'words', 'name', 'names',
    'question', 'questions', 'problem', 'problems', 'issue', 'issues', 'idea',
    'ideas', 'example', 'examples', 'reason', 'reasons', 'result', 'results',
    'looking', 'look', 'looks', 'looked', 'getting', 'gets', 'seems', 'still',
    'using', 'uses', 'used', 'working', 'works', 'worked', 'running', 'runs',
    'ran', 'going', 'goes', 'making', 'makes', 'doing', 'done', 'showing',
    'shows', 'want', 'wants', 'wanted', 'wanting', 'help', 'helps', 'helped',
    'helping', 'trying', 'tries', 'tried', 'telling', 'tells', 'asking', 'asks',
    'asked', 'calling', 'calls', 'called', 'needed', 'needs', 'needing',
    'basically', 'actually', 'literally', 'obviously', 'clearly', 'simply',
    'exactly', 'totally', 'completely', 'entirely', 'absolutely', 'perfectly',
    'fully', 'nearly', 'partly', 'mainly', 'mostly', 'generally', 'specifically',
    'particularly', 'especially', 'currently', 'recently', 'previously',
    'originally', 'initially', 'finally', 'eventually', 'ultimately',
    'essentially', 'basically', 'fundamentally',

    # Misc
    'ok', 'okay', 'fine', 'great', 'thanks', 'thank', 'please', 'hello', 'hi',
    'hey', 'bye', 'goodbye', 'etc', 'dont', 'doesnt', 'didnt', 'cant', 'couldnt',
    'wouldnt', 'shouldnt', 'wont', 'isnt', 'arent', 'wasnt', 'werent', 'havent',
    'hasnt', 'hadnt', 'ive', 'youve', 'weve', 'theyve', 'im', 'youre', 'hes',
    'shes', 'were', 'theyre', 'ill', 'youll', 'hell', 'shell', 'well', 'theyll',
    'id', 'youd', 'hed', 'shed', 'wed', 'theyd', 'whats', 'wheres', 'whos',
    'hows', 'thats', 'theres', 'lets', 'done', 'went', 'pasted', 'content',
    'contents', 'laurent'
}

# Generate word cloud
wordcloud = WordCloud(
    width=1600,
    height=800,
    background_color='white',
    stopwords=stop_words,
    colormap='plasma',  # Different colormap for technical terms
    max_words=100,
    relative_scaling=0.5,
    min_font_size=10
).generate(combined_text)

# Create figure and save
plt.figure(figsize=(20, 10))
plt.imshow(wordcloud, interpolation='bilinear')
plt.axis('off')
plt.tight_layout(pad=0)
plt.savefig('/Users/laurent/Downloads/technical_wordcloud.png', dpi=150, bbox_inches='tight')
print("Technical word cloud saved to: /Users/laurent/Downloads/technical_wordcloud.png")

# Also print top technical terms
from collections import Counter
import re

words = re.findall(r'\b[a-zA-Z]{3,}\b', combined_text.lower())
filtered_words = [w for w in words if w not in stop_words]
word_counts = Counter(filtered_words)

print("\nTop 30 technical terms:")
for word, count in word_counts.most_common(30):
    print(f"{word:20s} {count:4d}")
