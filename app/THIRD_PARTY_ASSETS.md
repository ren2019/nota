# 第三方资源与分发许可

Nota 代码采用根 MIT；以下资源保留其自身许可。完整 Web 构建将 `public/licenses/` 连同资源一起分发，不仅展示一个外部链接。

## 来源边界

Dolce 固定来源：[2aab8ef2333ba9e1a2a7b342080381fcacdd41ac](https://github.com/lodebar2026/dolce/tree/2aab8ef2333ba9e1a2a7b342080381fcacdd41ac)，上游 MIT 原文见 `LICENSE`。Nota 保留其字形字典；与固定上游逐文件相同，不额外宣称第三方曲谱/字体授权已独立核实。

## PaddleOCR 模型和字典

以下三文件逐字节携带自固定 Dolce；Nota 未训练、转换或修改它们。上游实现文档 `docs/实现/OMR-简谱识别.md` 记录：PaddleOCR 3.7.0 / PaddlePaddle 3.x，经 paddle2onnx 2.1.0 导出；识别为 PP-OCRv6 small、检测为 PP-OCRv4。此为上游说明，不伪称本项目重做过模型转换或恢复原训练 checkpoint。

| 文件 | SHA-256 |
| --- | --- |
| `public/redist/ocr/ch_PP-OCRv6_small_rec_infer.onnx` | `3b2569fbb5c6ec5fd7521920d46b42991ac27a348bc519a57de3dde6507e3f25` |
| `public/redist/ocr/ch_PP-OCRv4_det_infer.onnx` | `d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9` |
| `public/redist/ocr/ppocrv6_dict.txt` | `b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d` |

官方项目：[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)，Apache-2.0；分发许可原文见 `public/licenses/ocr/Apache-2.0.txt`。模型具体权重/转换链以上述固定上游快照为可复现来源；原始 Paddle 权重与当前 ONNX 的一一转换尚未独立重建，不用“补上许可文本”冒充权重来源实证。没有为未见到的上游 NOTICE 编造声明。

## 字体

Bravura.otf / Bravura.woff2 来自同一 Dolce，原版权 Steinberg Media Technologies GmbH，SIL OFL 1.1；原文见 `public/licenses/fonts/Bravura-OFL.txt`。

`NotaChordSymbols.otf` 是 Dolce 随附 Bravura Text 子集的更名版本。Nota 仅重建名称、版权与许可元数据；字符映射、字形轮廓和水平度量逐项相同。不得把它当未修改的 Bravura 发行。修改记录见 `public/licenses/fonts/MODIFICATIONS.md`。

## 音源、媒体与依赖

钢琴音源来自 FluidR3 GM / midi-js-soundfonts，作者和 CC BY 3.0 声明保留在 `public/redist/soundfont/LICENSE.txt`。

`docs/screenshot-zh.png`、`docs/screenshot-en.png`、`public/og-image.png` 由 Nota 用自制合成音符练习谱生成，无第三方原谱图像或歌词；代码/界面沿用本项目与 Dolce 的许可及归属。旧文件的 Git 历史未在 prepare 中改写。

npm 依赖按锁文件固定。构建收集当前平台实际安装依赖及开发工具的许可文本到 `public/licenses/npm/`，并提供 `index.json` 的名称、版本、SPDX 及文件索引；其他平台的可选依赖不伪称已安装检查。源码包不携带 node_modules 或原生桌面二进制。LGPL 组件的二进制包有单独许可/源码提供义务；本轮只提供可重新安装依赖的 Web 源码，未来捆绑二进制时需另核对。

部分 npm 包未附独立许可文本：补充目录 `public/licenses/supplemental/` 记录可取得的官方版本文本；fontkit、guid-typescript、smplr 使用上游包的许可/作者声明与标准 SPDX 正文，明确不是独立恢复的原版权证明。sharp-libvips 仓库自身的 Apache 许可与 libvips 组件的 LGPL 不混同，附 LGPL/GPL 参考全文；源码包不分发该原生二进制。
