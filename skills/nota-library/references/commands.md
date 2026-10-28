# 命令与提案

命令输出一行 JSON，失败使用非零退出状态；先判断 `ok` / `code`，再读取 `data`。用 UTF-8 JSON 文件传曲谱，避免将谱文插入 shell 命令。`nota-library --help` 是当前命令列表和退出码入口。

## 新建

```sh
nota-library find '曲名'
nota-library check --file proposal.json
nota-library create --file proposal.json
```

新建提案必填 `title`、`format`、完整 `text`；可带 `key`、`meter`、`source`、`presentation`、真实项目 base64 `project`。格式为 `123`、`abc`、`jcx`、`pu`、`jly`、`jpwabc` 或 `musicxml`，实际输入仍须通过服务端检查。原图项目须与正文/格式一致。

有意新建同名版本，经用户明确选择后使用 `create --file proposal.json --allow-duplicate-title`。

## 更新

```sh
nota-library get UUID > current.json
nota-library check UUID --revision N --file change.json
nota-library update UUID --revision N --file change.json
```

`get` 的完整记录是 `data`。`N` 来自这份最新记录，`change.json` 只提供需要改变的字段。`text` 是完整最终谱文。未提供字段沿用原记录；`source`、`presentation` 对象递归合并，数组和明确值替换。当前音乐改动对照限单首、单声部单旋律；不可比较结构会拒绝音乐修改。

`check` 不写库，返回 `diagnostics`、`fieldsChanged`、`changes` 和 `scope`。`changes.changedMeasures`、`pitchChanges` 是实际变化，`rhythmChanged`、`tiesChanged`、`structureChanged`、`lyricsChanged` 指出其他改动。

转换提案可带 `intent`：

```json
{"text":"完整新谱文","key":"1=D","intent":{"kind":"transpose","semitones":2}}
```

`edit` 是默认普通纠错；`transpose` 要求统一整数半音移动；`renotate` 要求逐音实际音高与音区不变。两种转换还要求节奏、休止、连线、小节/反复及歌词保留。服务端只检查声明的可检验意图，不理解自然语言。

## 原图项目

保留 `get` 返回的 `project`，无需自己解包或重打包。改变项目谱文时，提交完整最终 `text` 和 `edits`。例如从实际原文确定某个完整 token 的范围后：

```json
{"text":"完整最终谱文","edits":[{"from":42,"to":43,"insert":"3"}]}
```

索引是**最新原文的 UTF-16** 左闭右开范围；所有范围基于同一份原文，按位置排序、互不重叠。JavaScript 字符串索引符合此约定。计算时先核对 `oldText.slice(from,to)` 是预期片段，再在内存应用全部范围生成最终 `text`。前缀插入用 `from=to=0`。不同位置的编辑分别列出，不能将整篇替换伪装成局部改动。

服务端应用范围所得结果须逐字等于 `text`，并逐个核对迁移后的定位与解析音符/歌词位置。增删识别音符、错误范围、切换格式、损坏或不支持的项目会拒存。只改曲谱库名称、来源或版式时无需 `edits`，项目原样保留。

预检的 `projectUpdate.sha256` 绑定准备保存的新项目完整字节；CLI 会在保存回读时核对该哈希及其他内容。源图/PDF、`emitted.txt` 和未知项目条目保留。用户可以继续在网页点图校对。

## 软删、恢复

```sh
nota-library delete UUID --revision N
nota-library deleted
nota-library restore UUID --revision M
```

`M` 来自已删除列表的最新修订版本。删除和恢复都推进版本并在 CLI 内部完整回读；`deleted` 输出包括曲谱身份和修订信息。正常 `get` 不能读取已删除记录。

成功 `created`、`updated` 的 `data` 含已回读的 `record`、`url`、摘要和检查报告；`deleted`、`restored` 的 `data` 直接是已回读的记录及 `url`。发生后续他人更新或回读失败时，CLI 返回未确认，不把最新版冒充本次结果。
