# 本地生图方案（最佳效果路线）

## 目标
在 RTX 5060 Laptop (8GB, Blackwell) 上跑一套**动漫风 SDXL 工作流**，用于：
1. 生成桌宠图标（比心造型，1:1，可裁水印）
2. 后续"让她自己画一张自拍"（ComfyUI HTTP API 接进桌宠）

## 技术选型（为什么这么选）

| 组件 | 选择 | 理由 |
| --- | --- | --- |
| 推理框架 | **ComfyUI**（venv 安装，不用便携包） | 便携包带的 torch 多为 cu124，50 系显卡会退回 CPU |
| PyTorch | **cu128**（PyPI 官方 wheel） | Blackwell sm_120 需要 CUDA 12.8+ |
| 底模 | **Animagine XL 4.0**（SDXL 动漫） | 动漫质量稳定、提示词友好、6.9GB 适合 8G 显存 |
| 备选底模 | NoobAI-XL / Illustrious（v-pred） | 更二次元，但需要额外节点，先不折腾 |
| 角色一致性 | **IP-Adapter Plus (SDXL)** + CLIP-ViT-H | 用设定图当参考，相似度 70-80%，无需训练 |
| 面部修复 | **Impact Pack 的 FaceDetailer** | SDXL 出小脸容易糊，Detailer 明显提升 |
| 放大 | 4x-UltraSharp + Hires.fix | 1024 → 2048 分块放大，避免爆显存 |
| Python | **3.12**（winget 装，与系统 3.13 隔离） | ComfyUI/自定义节点对 3.12 兼容最好 |

## 分步计划（每步都有验证门，不合格就停）

### 步骤 1：环境（约 15 分钟，3.5 GB）
- [ ] `git clone https://github.com/comfyanonymous/ComfyUI`
- [ ] winget 装 Python 3.12
- [ ] venv + `pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128`
- [ ] **验证门**：`torch.cuda.is_available() == True` 且显卡名含 5060 → 否则停止
- [ ] `pip install -r requirements.txt`

### 步骤 2：模型（约 40 分钟，约 9 GB）
- [ ] Animagine XL 4.0（hf-mirror）→ `models/checkpoints/`
- [ ] SDXL VAE fp16 fix → `models/vae/`
- [ ] 4x-UltraSharp → `models/upscale_models/`
- [ ] IP-Adapter Plus + CLIP-ViT-H → `models/ipadapter/`、`models/clip_vision/`
- [ ] **验证门**：出第一张 512×512 测试图，看有没有花屏/OOM

### 步骤 3：工作流（约 20 分钟）
- [ ] 装 ComfyUI-Impact-Pack（FaceDetailer）
- [ ] 装 ComfyUI_IPAdapter_plus
- [ ] 组装 workflow JSON：文生图 + IP-Adapter 参考图 + FaceDetailer + Hires.fix
- [ ] **验证门**：用 `whale-girl-3view.png` 当参考，出 4 张比心图，看像不像

### 步骤 4：接入桌宠（可选，约 40 分钟）
- [ ] ComfyUI 开 API 模式（`--listen 127.0.0.1 --port 8188`）
- [ ] 主进程加 `/dsh-pet/draw` 端点 → 调 ComfyUI `/prompt` → 拿到图片路径
- [ ] 聊天窗加「让她画一张」按钮 / 语音指令「画一张自拍」

## 风险与止损

| 风险 | 概率 | 止损方式 |
| --- | --- | --- |
| Blackwell 跑不起来 | 中 | 步骤 1 就验证，只损失 3.5GB |
| 8GB 显存 OOM | 中 | 降分辨率到 768、关 IP-Adapter、单张生成 |
| 模型下载太慢/被墙 | 中 | 走 hf-mirror / 魔搭，失败换 Civitai 镜像 |
| 角色相似度不够 | 高 | 先用 IP-Adapter，不够再训 LoRA（20-30 张图） |
| 磁盘不够 | 低 | 现有 58.8GB，预计用 15GB，剩余 40GB+ |

## 时间与体积总预算
- 下载：约 13 GB（ComfyUI 0.2 + torch 3.5 + 模型 9）
- 时间：首次 1.5-2 小时（含下载等待）
- 出图速度：1024×1024 约 20-40 秒/张（8GB 显存，25 步）