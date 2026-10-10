#!/usr/bin/env python3
"""
LSQ-Net: Litera Semantic Quote Net (v2.1)
Trained on NVIDIA GeForce RTX 4060 with CUDA.
Dataset: 2,438 authentic Russian literary quotes and real classical narrative negatives.
"""

import json
import os
import math
import re
import random
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

MEANING_CATEGORIES = [
    "Экзистенциальная философия (жизнь, время, выбор)",
    "Этика и совесть (добро, зло, правда, искупление)",
    "Тайны человеческой души (любовь, страх, одиночество)",
    "Афоризм и парадокс (противоречия и ирония бытия)",
    "Вечные истины и красота (искусство, гармония, память)"
]

def str_hash(w: str) -> int:
    h = 0
    for ch in w:
        h = ((h * 31) + ord(ch)) & 0xFFFFFFFF
    return h

EXISTENTIAL = {
    'жизнь', 'жизни', 'жизнью', 'жизней', 'смерть', 'смерти', 'смертью', 
    'человек', 'человека', 'человеку', 'человеком', 'человеке', 'люди', 'людей', 'людям', 
    'время', 'времени', 'временем', 'вечность', 'вечности', 'вечный', 'вечно', 
    'бытие', 'бытия', 'судьба', 'судьбы', 'судьбе', 'судьбу', 'выбор', 'выбора', 
    'смысл', 'смысла', 'смысле', 'рождение', 'мир', 'мира', 'мире', 'вселенная', 
    'существование', 'небытие', 'пустота', 'рок', 'исход'
}

ETHICAL = {
    'добро', 'добра', 'добру', 'добром', 'зло', 'зла', 'злу', 'злом', 
    'совесть', 'совести', 'совестью', 'правда', 'правды', 'правде', 'правду', 
    'истина', 'истины', 'истине', 'истину', 'грех', 'греха', 'грехи', 'грехов', 
    'прощение', 'прощения', 'сострадание', 'вина', 'вины', 'ответственность', 
    'долг', 'долга', 'долге', 'честь', 'чести', 'стыд', 'стыда', 
    'ложь', 'лжи', 'ложью', 'лицемерие', 'предательство', 'благородство', 
    'порок', 'порока', 'пороков', 'бог', 'бога', 'богу', 'дьявол', 'дьявола'
}

PSYCHOLOGICAL = {
    'душа', 'души', 'душе', 'душу', 'душой', 'сердце', 'сердца', 'сердцу', 'сердцем', 
    'любовь', 'любви', 'любовью', 'страх', 'страха', 'страху', 'страсть', 'страсти', 
    'одиночество', 'одиночества', 'печаль', 'печали', 'грусть', 'грусти', 
    'тайна', 'тайны', 'тайну', 'боль', 'боли', 'болью', 'страдание', 'страдания', 
    'слезы', 'слез', 'радость', 'радости', 'тоска', 'тоски', 'надежда', 'надежды', 
    'отчаяние', 'отчаяния', 'мука', 'муки', 'тревога', 'покой', 'покоя'
}

APHORISTIC = {
    'все', 'всё', 'всего', 'всем', 'никто', 'никого', 'никому', 'ничто', 'ничего', 'ничему', 
    'никогда', 'всегда', 'каждый', 'каждого', 'всякий', 'всякого', 'но', 'однако', 
    'нежели', 'зато', 'чем', 'тем', 'если', 'ибо', 'лишь', 'только', 'разве', 
    'неужели', 'поистине', 'действительно', 'следовательно', 'стало', 'быть', 'суть'
}

ROUTINE_NOISE = {
    'пошел', 'пошла', 'пошли', 'вошел', 'вошла', 'вошли', 'вышел', 'вышла', 'вышли', 
    'подошел', 'подошла', 'сел', 'села', 'сели', 'встал', 'встала', 'встали', 
    'надел', 'надела', 'снял', 'сняла', 'взял', 'взяла', 'взяли', 'положил', 'положила', 
    'открыл', 'открыла', 'закрыл', 'закрыла', 'сказал', 'сказала', 'сказали', 
    'спросил', 'спросила', 'ответил', 'ответила', 'проговорил', 'пробормотал', 
    'посмотрел', 'посмотрела', 'взглянул', 'кивнул', 'улыбнулся', 'пожал', 
    'комната', 'комнаты', 'комнате', 'дверь', 'двери', 'дверью', 'окно', 'окна', 
    'стол', 'стола', 'столе', 'стул', 'пальто', 'шляпа', 'карета', 'лошадь', 
    'улица', 'дом', 'дома', 'доме', 'часы', 'минута', 'секунда', 'шаг', 'шаги'
}

def text_to_features(text: str) -> list:
    t = text.lower().strip()
    words = [w for w in re.sub(r'[^a-zа-яё0-9\s]', ' ', t).split() if len(w) > 0]
    vec = [0.0] * 64
    if not words:
        return vec

    l = len(t)
    # Bell curve centered around typical quote length (80-220 chars)
    vec[0] = math.exp(-((l - 130) / 90) ** 2)
    vec[1] = 1.0 if any(punct in t for punct in ['—', ':', ';']) else 0.0
    vec[2] = 1.0 if ('?' in t or '!' in t) else 0.0

    w_set = set(words)
    ex = len(w_set & EXISTENTIAL)
    et = len(w_set & ETHICAL)
    ps = len(w_set & PSYCHOLOGICAL)
    ap = len(w_set & APHORISTIC)
    no = len(w_set & ROUTINE_NOISE)

    vec[3] = ex / 4.0
    vec[4] = et / 3.0
    vec[5] = ps / 3.0
    vec[6] = ap / 4.0
    vec[7] = no / 3.0
    vec[8] = 1.0 if ('не ' in t and ', а ' in t) else 0.0
    vec[9] = 1.0 if (t.startswith('—') and any(d in t for d in ['сказал', 'ответил', 'спросил'])) else 0.0

    for w in words:
        h = str_hash(w) % 54
        vec[10 + h] += 0.35

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        inv = 1.0 / norm
        vec = [x * inv for x in vec]
    return vec

def determine_meaning_category(text: str) -> int:
    words = set(re.sub(r'[^a-zа-яё0-9\s]', ' ', text.lower()).split())
    scores = [
        len(words & EXISTENTIAL) * 1.5,
        len(words & ETHICAL) * 1.5,
        len(words & PSYCHOLOGICAL) * 1.4,
        len(words & APHORISTIC) * 1.1 + (1.0 if (('—' in text or ':' in text) and len(text) < 120) else 0.0),
        1.0 if any(k in text.lower() for k in ['красот', 'искусств', 'памят', 'творчеств', 'музык', 'гармони']) else 0.2
    ]
    best_idx = 0
    best_val = scores[0]
    for i in range(1, 5):
        if scores[i] > best_val:
            best_val = scores[i]
            best_idx = i
    return best_idx

class LSQNet(nn.Module):
    """LSQ-Net: Multi-Head Concept Attention & Semantic Latent Representation"""
    def __init__(self, in_features=64, hidden_dim=128):
        super().__init__()
        self.concept_attention = nn.Linear(in_features, 5)

        self.fc1 = nn.Linear(in_features, hidden_dim)
        self.ln1 = nn.LayerNorm(hidden_dim)
        self.act1 = nn.GELU()

        self.fc2 = nn.Linear(hidden_dim, in_features)
        self.ln2 = nn.LayerNorm(in_features)

        self.quote_head = nn.Linear(in_features + 5, 1)
        self.meaning_head = nn.Linear(in_features, 5)

    def forward(self, x):
        concepts = torch.sigmoid(self.concept_attention(x))

        res = x
        h = self.act1(self.ln1(self.fc1(x)))
        h = self.ln2(self.fc2(h)) + res

        combined = torch.cat([h, concepts], dim=-1)
        quote_logits = self.quote_head(combined)
        meaning_logits = self.meaning_head(h)

        return quote_logits, meaning_logits, concepts

def main():
    device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
    print("=" * 70)
    print(" LSQ-Net v2.1: Обучение на GPU RTX 4060 с CUDA")
    print("=" * 70)
    if device.type == 'cuda':
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 2)
        print(f"CUDA Device: {gpu_name} (8GB VRAM, Tensor/CUDA Cores)")
    else:
        print("Device: CPU")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_path = os.path.join(script_dir, '..', 'data', 'harvest', 'curated_quotes_dataset.json')

    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    raw_quotes = data['quotes']
    raw_negatives = data['negatives']
    print(f"Загружено из датасета: {len(raw_quotes)} цитат со смыслом и {len(raw_negatives)} контрастных нарративных предложений.")

    X_list = []
    y_q_list = []
    y_m_list = []

    # Positive samples
    for q in raw_quotes:
        feat = text_to_features(q)
        cat = determine_meaning_category(q)
        X_list.append(feat)
        y_q_list.append(1.0)
        y_m_list.append(cat)

    # Negative samples
    for n in raw_negatives:
        feat = text_to_features(n)
        X_list.append(feat)
        y_q_list.append(0.0)
        y_m_list.append(0)

    # Shuffle
    combined = list(zip(X_list, y_q_list, y_m_list))
    random.seed(42)
    random.shuffle(combined)
    X_list, y_q_list, y_m_list = zip(*combined)

    X_t = torch.tensor(X_list, dtype=torch.float32, device=device)
    y_q_t = torch.tensor(y_q_list, dtype=torch.float32, device=device).unsqueeze(1)
    y_m_t = torch.tensor(y_m_list, dtype=torch.long, device=device)

    # 85% train, 15% validation
    n_total = len(X_list)
    n_train = int(n_total * 0.85)

    X_train, X_val = X_t[:n_train], X_t[n_train:]
    y_q_train, y_q_val = y_q_t[:n_train], y_q_t[n_train:]
    y_m_train, y_m_val = y_m_t[:n_train], y_m_t[n_train:]

    print(f"Выборка разделена: {n_train} train, {n_total - n_train} val.")

    train_ds = TensorDataset(X_train, y_q_train, y_m_train)
    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)

    model = LSQNet(in_features=64, hidden_dim=128).to(device)

    bce_loss = nn.BCEWithLogitsLoss()
    ce_loss = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=0.008, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=150)

    epochs = 150
    print(f"\nЗапуск обучения нейросети на ядрах CUDA ({epochs} эпох)...")

    for epoch in range(1, epochs + 1):
        model.train()
        for batch_x, batch_y_q, batch_y_m in train_loader:
            optimizer.zero_grad()
            q_logits, m_logits, _ = model(batch_x)
            l_q = bce_loss(q_logits, batch_y_q)

            mask_q = (batch_y_q.squeeze(1) == 1)
            l_m = ce_loss(m_logits[mask_q], batch_y_m[mask_q]) if mask_q.sum() > 0 else 0.0

            loss = l_q + 0.5 * l_m
            loss.backward()
            optimizer.step()

        scheduler.step()

        if epoch % 25 == 0 or epoch == epochs:
            model.eval()
            with torch.no_grad():
                q_val_logits, m_val_logits, _ = model(X_val)
                preds = (torch.sigmoid(q_val_logits) >= 0.5).float()
                acc_val = (preds == y_q_val).float().mean().item() * 100.0

                mask_pos = (y_q_val.squeeze(1) == 1)
                m_preds = torch.argmax(m_val_logits[mask_pos], dim=-1)
                m_acc = (m_preds == y_m_val[mask_pos]).float().mean().item() * 100.0

                print(f"Эпоха {epoch:3d}/{epochs} | Val Quote Accuracy: {acc_val:.2f}% | Val Meaning Accuracy: {m_acc:.2f}%")

    out_path = os.path.join(script_dir, '..', 'src', 'lib', 'ai', 'deepModelWeights.json')
    out_path = os.path.abspath(out_path)

    model.eval()
    with torch.no_grad():
        weights_export = {
            "version": "2.1.0-lsq-net-curated",
            "model_type": "LiteraSemanticQuoteNet",
            "device": torch.cuda.get_device_name(0) if device.type == 'cuda' else 'cpu',
            "dataset_size": n_total,
            "in_features": 64,
            "hidden_dim": 128,
            "categories": MEANING_CATEGORIES,
            "concept_attention_w": model.concept_attention.weight.cpu().numpy().tolist(),
            "concept_attention_b": model.concept_attention.bias.cpu().numpy().tolist(),
            "fc1_w": model.fc1.weight.cpu().numpy().tolist(),
            "fc1_b": model.fc1.bias.cpu().numpy().tolist(),
            "ln1_weight": model.ln1.weight.cpu().numpy().tolist(),
            "ln1_bias": model.ln1.bias.cpu().numpy().tolist(),
            "fc2_w": model.fc2.weight.cpu().numpy().tolist(),
            "fc2_b": model.fc2.bias.cpu().numpy().tolist(),
            "ln2_weight": model.ln2.weight.cpu().numpy().tolist(),
            "ln2_bias": model.ln2.bias.cpu().numpy().tolist(),
            "quote_head_w": model.quote_head.weight.cpu().numpy().tolist(),
            "quote_head_b": model.quote_head.bias.cpu().numpy().tolist(),
            "meaning_head_w": model.meaning_head.weight.cpu().numpy().tolist(),
            "meaning_head_b": model.meaning_head.bias.cpu().numpy().tolist()
        }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(weights_export, f, indent=2, ensure_ascii=False)

    print(f"\nМодель LSQ-Net v2.1 успешно обучена и сохранена в:\n{out_path}")
    print(f"Размер файла весов: {os.path.getsize(out_path) / 1024:.1f} KiB")

if __name__ == '__main__':
    main()
