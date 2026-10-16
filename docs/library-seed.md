# 家庭曲谱库初始化

2026-10-16 已将以下 9 首存入运行中的共享曲谱库；原有两份《小星星》保留，共 11 首。全部采用单声部、单旋律练习谱，可打开编辑、试听、移调并下载 PDF/PNG。

| 曲名 | 入库版本与来源 |
| --- | --- |
| 义勇军进行曲 | 含前奏，依[官方标准简谱](https://www.cmab.gov.hk/doc/national_anthem/Numbered-Musical-Notation-SC.pdf)人工转写；37 小节、104 音，三连音保留。 |
| 星条旗 | [1919 Service Version，由 John Atchley 转录](https://trillian.mit.edu/~jc/music/abc/anthem/song/Star_Spangled_Banner_Bbw_4v.abc)，取完整主旋律；34 小节、105 音。用户上传的第一页另作识谱测试。 |
| 苏联国歌 | [Jkwchui 的 LilyPond 主旋律，CC0](https://commons.wikimedia.org/wiki/File:RussischeHymneVer1.svg)，含反复与两个结尾；24 小节、104 音。反复处 3.5 拍结尾与 0.5 拍弱起相接，不是缺拍。 |
| 国际歌 | [1920 年谱本的 MusicXML，Linda Cantoni 转录](https://www.gutenberg.org/files/69486/69486-h/music/music056-057.mxl)，124 音，保留连线和时值；34 小节。 |
| 马赛曲 | [John Chambers 的 1934 谱本转录](https://trillian.mit.edu/~jc/music/abc/France/Marseillaise.abc)，取最高旋律音；参考 [Iain Patterson / Breizh Partitions 完整谱页](https://www.partitions.bzh/partition/784_La_Marseillaise)修正三处源时值，29 小节、109 音。校对参考及衍生练习谱按 CC BY-SA 3.0 署名、同许可保存。 |
| 莫斯科郊外的晚上 | 依用户 `IMG_4549.PNG` 人工校正的单段练习版，第一段歌词，保留中段反复，采用最后一段的结束句；18 小节、41 音。原图与识别项目一起保存，可继续核对。 |
| 两只老虎 | 法国传统旋律 Frère Jacques，中文常见第一段，8 小节、32 音。 |
| 苏珊娜 | [Frank Nordberg / Musicaviva 转录的旋律](https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2Fmirror%2Fkirby98.fsnet.co.uk%2Foh%2FOh_Susanna_1%2F0000)，移低一个八度用于练习，18 小节、55 音。 |
| 字母歌 | 小星星旋律的常见 ABC Song，LMNOP 与 W 拆分八分音符，12 小节、45 音。 |

## 初始化与验证

原始材料、谱文与初始化清单位于忽略目录 `local/seed-sources/`、`local/seeds/`。谱文的首行注释保存来源，不把资料来源塞进导出品牌页脚。

```sh
npm run seed:library -- local/seeds/library-seed.json
```

命令通过现有 API 保存并逐首回读验证，不覆盖同名记录；第二次执行全部跳过。新谱尚未存在时才写入，发生错误直接停止并报告。备份仍使用 `local/library/`。

Safari 独立 Nota App 已逐首打开 9 首，均显示谱面、可编辑源码与 PDF 下载入口。记录见 `local/qa/library-seed-result.json`、`seed-validation.log`。小节时值校验全部通过，苏联国歌的反复弱起连接按上述例外记录。

初始化谱源与真实图片自动识别验收分开：这些可用曲谱不代表自动识别已经达到逐音全对。真实测试仍见 [acceptance.md](acceptance.md)。
