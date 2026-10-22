# Web 发行范围

本轮提供 Node.js 24 / npm 10 上自行部署的 Nota Web 源码包，包含页面、曲谱库和来源 API。需要网络服务，不是静态离线版。macOS 常驻 Web 服务仍是 Web 部署方式，不等于 Tauri 桌面应用。

原生恢复任务以 [GitHub #21](https://github.com/ren2019/nota/issues/21) 为准；本轮准备与验证见 [#20](https://github.com/ren2019/nota/issues/20)。

Tauri 桌面包暂不发布；app/src-tauri 保留为上游参考，Web 源码包排除该目录及桌面发布工具。原生构建、平台权限和以下依赖问题未修复或验证：

| 包/公告 | 状态 |
| --- | --- |
| webpki-root-certs 1.0.9 / RUSTSEC-2026-0383 | 原生 TLS 证书信任问题；恢复桌面发行前升级至修复版本并核对 feature/构建下载链 |
| glib 0.18.5 / RUSTSEC-2024-0429 | Linux GTK 相关迭代器 unsoundness；需升级并验证平台 |
| proc-macro-error、rustybuzz、ttf-parser、zbus_names、zvariant、zvariant_derive | 2026-10-22 查询命中停更公告；不等同确认高危漏洞，恢复原生发行前逐链处理 |

这些问题不标记为已修复；Web 安装/构建不执行 Cargo。真实照片整谱识别准确性、各真机和离线功能仍遵循根 README 的边界。
