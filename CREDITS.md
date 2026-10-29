# CREDITS · 署名与许可要求（发布前请逐条核对）

本项目把多个第三方项目/素材拼在一起，**各部分许可不同**。下面按"你必须做什么"写，避免漏掉。

---

## 一、必须署名（不可省略）

| 内容 | 署名 | 许可 |
| --- | --- | --- |
| **鲸鱼娘 Live2D 模型**（`live2d/model/**`：moc3、贴图、44 个表情、8 组动作、物理） | **上善无影**（角色形象原作「濑月」）· **ZipZipPipe**（女仆鲸鱼娘二次设计）· **水六面**（Live2D 模型制作） | **CC BY-NC-SA 4.0** |
| `live2d/pet.js`（桌宠前端，214 KB） | **Andersen216**（dsh-whale-girl-live2d 作者） | MIT |
| `live2d/vendor/pixi.min.js` | PIXI.js contributors（6.5.10） | MIT |
| `live2d/vendor/cubism4.min.js` | pixi-live2d-display contributors（0.4.0） | MIT |
| `live2d/vendor/live2dcubismcore.min.js` | **Live2D Inc.**（Cubism Core 5.1.0） | Live2D 专有许可（随 Cubism SDK 可再分发） |

原始许可文件已一并放在 `live2d/` 下，**发布时不要删**：

- `live2d/NOTICE.md`（原作者的许可分层说明）
- `live2d/AUTHORS.md`（逐项贡献者）
- `live2d/PROVENANCE.md`（逐文件来源与"使用须知"）

---

## 二、硬性限制（不遵守就侵权）

### 1. 模型美术：CC BY-NC-SA 4.0

- **NC（非商业）**：不能收费、不能带货、不能作为任何付费产品或服务的卖点、不能接广告变现。
- **SA（相同方式共享）**：你**修改**过的模型/贴图再分发时，必须同样用 CC BY-NC-SA 4.0 发布。
- **BY（署名）**：必须在 README/关于页/发布页写明三位作者，并给出 `NOTICE.md` 链接。
- 该许可**不继承到我们的代码**（代码可以自己选 MIT），但**模型文件本身必须保持 NC-SA**。

### 2. Cubism Core：不得修改

`live2dcubismcore.min.js` 是 Live2D 公司的闭源运行时，只能**原样随应用分发**，不能反编译/修改。
（如需商用，须自行取得 Live2D 的商用授权——这与上面模型的 NC 限制是两件事。）

### 3. MIT 部分：保留版权声明

`pet.js`、`pixi.min.js`、`cubism4.min.js` 都是 MIT：**保留文件头部的版权与许可声明**即可，
不要去掉、不要改署名。分发时把我们的 `LICENSE`（建议 MIT）和上述文件的声明一起带上。

---

## 三、建议的发布清单

```
LICENSE                     ← 我们自己的代码，建议 MIT
CREDITS.md                  ← 本文件
README.md                   ← 开头写明「模型美术 CC BY-NC-SA 4.0 + 三位作者」
live2d/NOTICE.md            ← 原样保留
live2d/AUTHORS.md           ← 原样保留
live2d/PROVENANCE.md        ← 原样保留
```

README 建议开头就放这段（可直接抄）：

> 本项目的鲸鱼娘 Live2D 模型来自 [dsh-whale-girl-live2d](https://github.com/Andersen216/dsh-whale-girl-live2d)，
> 美术许可为 **CC BY-NC-SA 4.0**（非商业、署名、相同方式共享），
> 角色形象：**上善无影** · 二次设计：**ZipZipPipe** · Live2D 模型：**水六面**。
> 代码部分为 MIT；Cubism Core 为 Live2D Inc. 专有运行时。
> **本项目不收费、不接广告、不卖周边。**

---

最后核对一遍（发布前）：

- [ ] README 里有三位作者署名 + CC BY-NC-SA 链接
- [ ] `live2d/NOTICE.md`、`AUTHORS.md`、`PROVENANCE.md` 都在仓库里
- [ ] `pet.js`、`pixi.min.js`、`cubism4.min.js` 的版权头没被删
- [ ] `live2dcubismcore.min.js` 未被修改
- [ ] 项目没有收费/广告/付费卖点
