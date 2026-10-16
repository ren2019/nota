# iPhone 底部工具条安全区与留白

调研日期：2026-10-16。结论：这次微调保留现有 viewport 设置，增加手机底栏的常规底部留白，并继续读取浏览器提供的安全区。不要为抬高几个按钮而全局开启 `viewport-fit=cover`，也不要把某款 iPhone 的安全区写成固定 `34px`。

## 官方资料确认的行为

- `viewport-fit` 默认是 `auto`；Safari 会将内容放入安全区域。`cover` 才会让页面布局延伸到屏幕边缘，此后网页必须保护重要内容，避免圆角、传感器区域和 Home 指示条遮挡。[WebKit：Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- `env(safe-area-inset-top/right/bottom/left)` 由浏览器提供，表达安全区与视口边缘之间的距离。Safari 底部地址栏展开和收起时，安全区可能变化；横屏还需考虑左右两侧。主屏幕 Web App 没有 Safari 的底部标签栏，不能照搬 Safari 地址栏的固定高度。[Apple：Design for Safari 15，WWDC21](https://developer.apple.com/videos/play/wwdc2021/10029/)
- 安全区不能替代设计本身的边距。`max(12px, env(safe-area-inset-left))` 的意思是取默认边距和安全区中较大的一个；它适合保证横屏边缘避让、竖屏仍有最小侧边距。[WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- 如果需要“越过安全区后，仍额外留出日常间距”，应使用加法，例如 `calc(1rem + env(safe-area-inset-bottom))`。Apple 的演示同时提醒：已有 margin 再加相同用途的 padding 会叠高，应调整现有间距，而不是在多层容器重复补偿。[WWDC21](https://developer.apple.com/videos/play/wwdc2021/10029/)

以上资料说明布局机制，不提供适用于所有设备的固定安全区尺寸。不能仅凭截图判断当前 inset 数值；浏览器已经内缩视口时，也不应再人工补一遍预估的硬件安全区。

## Nota 当前代码与最小建议

调研时的代码：`app/index.html` 只有 `width=device-width, initial-scale=1.0`，没有 `viewport-fit=cover`；另有 `black-translucent` 主屏幕状态栏配置。编辑底栏使用 `max(6px, env(safe-area-inset-bottom))`，练习底栏为 `max(8px, …)`，联网找谱操作栏为 `max(12px, …)`。这是代码观察，不代表各 iPhone 实际计算出的值。

建议本次只调整底栏，不切换全站视口模式：

1. 手机底部基础留白统一为约 `16px`，作为产品设计取值；保留原有按钮尺寸与触摸区域。即使浏览器报告 bottom inset 为 `0`，按钮下方也不再只有 6–8px。
2. 需要安全区之外仍有呼吸空间的底栏可用 `calc(16px + env(safe-area-inset-bottom, 0px))`；在同一个底栏容器承担这段留白，外层不要重复添加。为不支持该声明的环境保留普通 `padding-bottom: 16px` 回退。16px 并非 Apple 强制标准。
3. 左右避让仍用 `max(常规侧边距, env(safe-area-inset-left/right, 0px))`，保证横屏两端按钮不贴圆角。不要给整页与工具条同时叠加一份安全区。
4. 保留 `viewport-fit=auto` 的现状。若以后追求真正的全屏背景，再单独审核首页、详情、搜索、弹窗与完整 Dolce 编辑器的顶部和横屏布局后引入 `cover`。已有个别组件读取 env，不等于所有页面已经能承担全屏布局责任。这是依据官方行为及当前代码覆盖范围作出的实现建议。

## 本次落地与实测

- 编辑、练习与联网找谱的底部操作栏统一读取手机基础留白 `16px`，与浏览器的 bottom inset 相加，只在各自底栏补偿一次。零 inset 下相比原来分别增加 10 / 8 / 4px。适用于 680px 以下窗口，以及横屏在内的粗指针触控设备；普通宽屏保留原基础留白。
- 编辑底栏同时补上左右安全区避让；按钮尺寸和 Dolce 专业工作区不改动，viewport 配置保持原样。
- 通过隔离临时 HTTP 曲谱库操作真实 App，Chromium / WebKit 共检查 36 个布局：360 / 390 / 430、844 横屏和 1280 宽屏，覆盖上述三种底栏。没有全页横向溢出、按钮越出视口或未捕获浏览器错误；窄屏、横屏及安全区场景已目视核对。
- Chromium 另用 [DevTools 官方安全区覆盖接口](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setSafeAreaInsetsOverride) 验证浏览器环境值：bottom 为 34px 时实际底部 padding 为 50px，横屏 bottom 为 21px 时为 37px，左右 44px 时编辑底栏两侧实际避让 44px。这是环境变量覆盖测试，数值不是产品中写死的设备尺寸。
- 正式构建通过；证据在忽略的 `local/qa/safe-area/`。本轮未部署，没有修改生产曲谱库。构建只在独立工作区执行。

## 验证边界

浏览器自动化可核对零 inset 下的底部间距、窄屏/横屏的按钮可达性，以及无整页横向溢出；用可控 CSS 值验证安全区加法，只能证明布局公式。桌面 WebKit 的手机参数不等于真实 iPhone Safari/PWA 的安全区、圆角或系统指示条。真实系统 inset 应由设备浏览器计算，不能靠 UA 判断或固定像素猜测。

资料正文均通过 `remio web_get` 读取；未依赖二手文章。
