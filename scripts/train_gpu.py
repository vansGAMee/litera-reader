#!/usr/bin/env python3
import json
import os
import torch
import torch.nn as nn
import torch.optim as optim

def main():
    device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
    print(f"=== Обучение ИИ-модели вычленения цитат на GPU ===")
    if device.type == 'cuda':
        gpu_name = torch.cuda.get_device_name(0)
        capability = torch.cuda.get_device_capability(0)
        total_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 2)
        print(f"Используется видеокарта: {gpu_name}")
        print(f"CUDA Compute Capability: {capability[0]}.{capability[1]}")
        print(f"Общая видеопамять VRAM: {total_mem:.0f} MiB")
    else:
        print("Внимание: CUDA недоступна, используется CPU")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_path = os.path.join(script_dir, 'dataset_tensors.json')
    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    X_raw = data['X']
    y_raw = data['y']
    dims = data['dims']

    X = torch.tensor(X_raw, dtype=torch.float32, device=device)
    y = torch.tensor(y_raw, dtype=torch.float32, device=device).unsqueeze(1)

    print(f"Размерность признаков: {dims}")
    print(f"Всего образцов в датасете: {X.shape[0]} (цитаты: {int(y.sum().item())}, обычный текст: {int((1-y).sum().item())})")

    # Архитектура модели: взвешенный классификатор признаков с регуляризацией
    class QuoteClassifier(nn.Module):
        def __init__(self, input_dim):
            super().__init__()
            self.linear = nn.Linear(input_dim, 1)

        def forward(self, x):
            return self.linear(x)

    model = QuoteClassifier(dims).to(device)

    # Инициализация весов с априорными литературными приоритетами
    with torch.no_grad():
        # Приоритет структурным признакам:
        # 0: lengthRatio (+), 1: punctuation (+), 2: wisdomDensity (++), 3: generalization (++),
        # 4: antithesis (++), 5: dialoguePenalty (--), 6: actionVerbPenalty (--), 7: standalone (+)
        model.linear.weight[0, 0] = 1.2
        model.linear.weight[0, 1] = 0.8
        model.linear.weight[0, 2] = 2.4
        model.linear.weight[0, 3] = 1.5
        model.linear.weight[0, 4] = 1.2
        model.linear.weight[0, 5] = -2.5
        model.linear.weight[0, 6] = -2.0
        model.linear.weight[0, 7] = 1.0
        model.linear.bias.fill_(-0.5)

    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.AdamW(model.parameters(), lr=0.015, weight_decay=1e-3)

    epochs = 400
    print(f"\nЗапуск {epochs} эпох обучения на ядрах CUDA...")
    for epoch in range(1, epochs + 1):
        optimizer.zero_grad()
        logits = model(X)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()

        if epoch % 100 == 0 or epoch == epochs:
            with torch.no_grad():
                probs = torch.sigmoid(logits)
                preds = (probs >= 0.5).float()
                acc = (preds == y).float().mean().item() * 100.0
                tp = ((preds == 1) & (y == 1)).float().sum().item()
                fp = ((preds == 1) & (y == 0)).float().sum().item()
                fn = ((preds == 0) & (y == 1)).float().sum().item()
                precision = (tp / (tp + fp)) * 100 if (tp + fp) > 0 else 0
                recall = (tp / (tp + fn)) * 100 if (tp + fn) > 0 else 0
                f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0

                print(f"Эпоха {epoch:3d}/{epochs} | Loss: {loss.item():.4f} | Точность: {acc:.1f}% | Precision: {precision:.1f}% | Recall: {recall:.1f}% | F1: {f1:.1f}%")

    with torch.no_grad():
        final_weights = model.linear.weight[0].cpu().numpy().tolist()
        final_bias = float(model.linear.bias.item())

    out_weights_path = os.path.join(script_dir, '..', 'src', 'lib', 'ai', 'baseModelWeights.json')
    out_weights_path = os.path.abspath(out_weights_path)
    weights_dict = {
        "version": "1.0.0",
        "device_trained_on": torch.cuda.get_device_name(0) if device.type == 'cuda' else 'cpu',
        "dims": dims,
        "weights": final_weights,
        "bias": final_bias,
        "metrics": {
            "accuracy": round(acc, 2),
            "precision": round(precision, 2),
            "recall": round(recall, 2),
            "f1": round(f1, 2)
        }
    }

    with open(out_weights_path, 'w', encoding='utf-8') as f:
        json.dump(weights_dict, f, indent=2, ensure_ascii=False)

    print(f"\nМодель успешно сохранена в: {out_weights_path}")
    print(f"Веса готовы для мгновенного инференса и онлайн-дообучения в браузере!")

if __name__ == '__main__':
    main()
