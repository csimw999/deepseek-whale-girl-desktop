# CREDITS · 借用了谁的成果

这个项目**不是从零写的**。外壳、语音、聊天、DSH 联动是我们的；**模型美术、桌宠前端、像素素材、参考图**都来自社区，许可各不相同。

---

## 一、核心借用（必须署名）

| 我们用了什么 | 来自谁 | 许可 | 在仓库哪里 |
| --- | --- | --- | --- |
| **鲸鱼娘 Live2D 模型**<br>（`c_0120.moc3`、贴图、44 个表情、8 组动作、物理） | 角色形象原作 **上善无影**（「濑月」）<br>女仆鲸鱼娘二次设计 **ZipZipPipe**<br>Live2D 模型制作 **水六面**<br>模型整理 [Andersen216/dsh-whale-girl-live2d](https://github.com/Andersen216/dsh-whale-girl-live2d) | **CC BY-NC-SA 4.0** | `live2d/model/**` |
| **桌宠前端**（`pet.js`，214 KB，气泡/工具栏/信封/表情动作全在里面） | **Andersen216** | **MIT** | `live2d/pet.js`（原样，仅两处补丁，见下） |
| **像素形态**（雪碧图、插件 UI、亲密度/小鱼干/台词池） | **@linxin666/dsh-pet** 0.3.10 | **Apache-2.0** | `app/**`、`pets/**` |
| **角色参考图**（三视图 / Q 版 / 成熟版 / 脸特写） | [TreapGoGo/deepseek-whale-girl](https://github.com/TreapGoGo/deepseek-whale-girl)（258 张社区二创资产库） | **MIT** | `assets/icon/refs/**` |
| **PIXI.js 6.5.10** | PIXI contributors | MIT | `live2d/vendor/pixi.min.js` |
| **pixi-live2d-display 0.4.0** | pixi-live2d-display contributors | MIT | `live2d/vendor/cubism4.min.js` |
| **Cubism Core 5.1.0** | **Live2D Inc.** | Live2D 专有（随 SDK 可再分发，**不得修改**） | `live2d/vendor/live2dcubismcore.min.js` |

### 我们对上游做了什么（只有两处）

`live2d/pet.js` 是 **上游原样拷贝**，为了桌面化只加了两行导出：

1. `window.__DSHPetHit` —— 把 alpha 命中测试暴露给外壳，用来做「点空白处穿透到下层窗口」
2. `DSHPet.setFace` —— 把表情接口暴露给宿主，用来做「相位 → 表情」联动

其余所有 UI/CSS/动作/台词/信封逻辑都是原作者的实现。我们的壳子是 `live2d/pet.html`（约 100 行）。

---

## 二、外部依赖与模型（**不随仓库分发**）

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| ollama / qwen2.5:1.5b / 7b | MIT / Apache-2.0 | 本地聊天，用户自己 `ollama pull` |
| sherpa-onnx + SenseVoice | Apache-2.0 | 语音识别，用户自己下载 |
| edge-tts（晓伊音色） | 微软 Azure TTS 服务条款 | 运行时联网调用，音频不随仓库分发 |
| ComfyUI / Animagine XL 4.0 | GPL-3.0 / Fair AI Public License | 可选组件，`docs/image-gen-plan.md` 有说明 |
| Electron 33 | MIT | 运行时 |

---

## 三、硬性限制（不遵守就侵权）

### 1. 模型美术 = CC BY-NC-SA 4.0

- **NC 非商业**：不能收费、不能带货、不能当付费产品的卖点、不能接广告变现
- **BY 署名**：必须写明三位作者（上善无影 / ZipZipPipe / 水六面）
- **SA 相同方式共享**：修改过的模型文件再分发时，必须同样用 CC BY-NC-SA 4.0

> 这个许可**不传染到我们的代码**（代码可以 MIT），但模型文件本身必须保持 NC-SA。

### 2. Cubism Core 不得修改

闭源运行时，只能原样随应用分发，不能反编译/改。

### 3. MIT / Apache 部分保留声明

`pet.js`、`pixi.min.js`、`cubism4.min.js` 保留文件头版权声明；
`app/**`（dsh-pet 插件产物）保留其 Apache-2.0 声明，`app/plugin/package.json` 里的 `license` 字段**不要删**。

---

## 四、原始许可文件（不要删）

```
live2d/NOTICE.md        原作者的许可分层说明
live2d/AUTHORS.md       逐项贡献者
live2d/PROVENANCE.md    逐文件来源与使用须知
app/plugin/package.json 内置 license: Apache-2.0
```

---

## 五、发布前核对

- [x] README 开头有三位作者署名 + CC BY-NC-SA 说明
- [x] `live2d/NOTICE.md`、`AUTHORS.md`、`PROVENANCE.md` 在仓库里
- [x] `pet.js` / `pixi.min.js` / `cubism4.min.js` 版权头未删
- [x] `live2dcubismcore.min.js` 未修改
- [x] 写明 dsh-pet 插件（Apache-2.0）与社区参考图（MIT）
- [x] 项目不收费、不接广告、不卖周边

---

## 六、致谢

没有这三个人就没有这只鲸鱼娘：**上善无影** 画出了她，**ZipZipPipe** 把她变成女仆，**水六面** 让她动起来。
**Andersen216** 把她做成了会说话、会生气的桌宠前端。
**@linxin666** 的 dsh-pet 插件提供了像素形态的整套交互与数值设定。
**TreapGoGo** 维护的社区资产库给了角色参考图。
