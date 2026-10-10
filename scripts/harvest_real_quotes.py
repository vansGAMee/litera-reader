#!/usr/bin/env python3
"""
Harvest authentic Russian curated quotes with genuine meaning from open sources
and ordinary narrative prose from complete Russian classical literature.
"""

import urllib.request
import urllib.parse
import re
import html
import time
import json
import os
import random

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'harvest')
os.makedirs(OUT_DIR, exist_ok=True)

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def clean_text(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'^[\s—–-]+', '', text)
    text = ' '.join(text.split())
    return text.strip()

def fetch_citaty_info_page(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            content = resp.read().decode('utf-8', errors='ignore')
            matches = re.findall(r'<div class=\"field-name-body\">\s*<p>(.*?)</p>\s*</div>', content, re.DOTALL)
            results = []
            for m in matches:
                c = clean_text(m)
                if 35 <= len(c) <= 450 and not c.startswith('http'):
                    results.append(c)
            return results
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

def harvest_quotes():
    quotes = set()
    
    # 1. Top rated
    print("Fetching top rated quotes...")
    for page in range(0, 10):
        url = f"https://citaty.info/rating?page={page}"
        qs = fetch_citaty_info_page(url)
        for q in qs: quotes.add(q)
        time.sleep(0.3)
    print(f"Collected {len(quotes)} quotes from rating.")

    # 2. Key philosophical & ethical topics
    topics = [
        'smysl-zhizni',
        'sovest',
        'dobro-i-zlo',
        'istina-pravda',
        'smert',
        'dusha',
        'svoboda',
        'mudrost',
        'vremya',
        'lyubov',
        'odinochestvo',
        'chelovek-lyudi',
        'schaste'
    ]
    for top in topics:
        print(f"Fetching topic: {top}...")
        for page in range(0, 6):
            url = f"https://citaty.info/topic/{top}?page={page}"
            qs = fetch_citaty_info_page(url)
            for q in qs: quotes.add(q)
            time.sleep(0.3)
        print(f"Total so far: {len(quotes)}")

    # 3. Authors with profound quotes
    authors = [
        'fyodor-dostoevskii',
        'fyodor-dostoevskii/citaty-so-smyslom',
        'lev-tolstoi',
        'mihail-bulgakov',
        'anton-chehov',
        'erih-mariya-remark',
        'antuan-de-sent-ekzyuperi'
    ]
    for auth in authors:
        print(f"Fetching author: {auth}...")
        for page in range(0, 4):
            url = f"https://citaty.info/man/{auth}?page={page}"
            qs = fetch_citaty_info_page(url)
            for q in qs: quotes.add(q)
            time.sleep(0.3)

    print(f"Total harvested unique curated quotes: {len(quotes)}")
    return list(quotes)

def fetch_classic_book(author_dir: str, filename: str) -> str:
    quoted_name = urllib.parse.quote(filename)
    url = f"https://raw.githubusercontent.com/d0rj/RusLit/master/prose/{author_dir}/{quoted_name}"
    print(f"Downloading classic text: {author_dir}/{filename}...")
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode('utf-8', errors='ignore')
            print(f"Downloaded {len(text)} characters.")
            return text
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
        return ""

def extract_narrative_negatives(book_texts, target_count=1500):
    negatives = []
    
    for text in book_texts:
        raw_sentences = re.split(r'(?<=[.!?])\s+', text)
        for s in raw_sentences:
            s = ' '.join(s.split()).strip()
            s = re.sub(r'^[—–\-\"\«\s]+', '', s)
            if not (35 <= len(s) <= 220):
                continue
            
            is_routine_action = bool(re.search(
                r'\b(вош[её]л|вышел|подош[её]л|отош[её]л|сел|встал|открыл|закрыл|посмотрел|взглянул|'
                r'повернулся|протянул|взял|положил|надел|снял|комнат[аеыу]|двер[ьие]|стол[ауе]|стул|'
                r'пальто|шляп[ауе]|окн[оае]|улиц[аеу]|дом[аеу]|карет[аеу]|лошад|письмо|чай|кофе|'
                r'подал|поехал|приехал|проговорил|спросил|ответил|кивнул|улыбнулся|пожал плечами)\b',
                s, re.IGNORECASE
            ))
            
            has_deep_philosophy = bool(re.search(
                r'\b(смысл|совест|истин|смерт|вечност|душа|бог[ауе]?|дьявол|вселенн|быти[ея]|мораль|грех|'
                r'прощени[ея]|предательств|свобод[аые]|мудрост|судьб|страдани|бессмерти|порок)\b',
                s, re.IGNORECASE
            ))
            
            if is_routine_action and not has_deep_philosophy:
                negatives.append(s)

    random.seed(42)
    random.shuffle(negatives)
    seen = set()
    unique_negatives = []
    for n in negatives:
        if n not in seen:
            seen.add(n)
            unique_negatives.append(n)
        if len(unique_negatives) >= target_count:
            break
            
    print(f"Extracted {len(unique_negatives)} routine narrative sentences.")
    return unique_negatives

def main():
    quotes = harvest_quotes()
    
    books = [
        ("Dostoevsky", "Братья Карамазовы.txt"),
        ("Tolstoy", "Анна Каренина.txt"),
        ("Gogol", "Мёртвые души.txt"),
        ("Chekhov", "Агафья.txt")
    ]
    
    book_texts = []
    for author, bname in books:
        txt = fetch_classic_book(author, bname)
        if txt:
            save_path = os.path.join(OUT_DIR, f"{author}_{bname}")
            with open(save_path, 'w', encoding='utf-8') as f:
                f.write(txt)
            book_texts.append(txt)

    negatives = extract_narrative_negatives(book_texts, target_count=len(quotes))

    dataset = {
        'quotes': quotes,
        'negatives': negatives,
        'metadata': {
            'quotes_count': len(quotes),
            'negatives_count': len(negatives),
            'source': 'citaty.info + Russian Classical Literature (RusLit)',
            'timestamp': time.time()
        }
    }

    out_file = os.path.join(OUT_DIR, 'curated_quotes_dataset.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"SUCCESS! Saved dataset to {out_file} with {len(quotes)} quotes and {len(negatives)} narrative negatives.")

if __name__ == '__main__':
    main()
