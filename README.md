# m3u8 Studio

基于 [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE) 的中文桌面下载应用。采用 Electron，下载工作由官方引擎执行。

本项目采用 MIT 许可，支持 Fork、修改和二次开发。普通用户从 [GitHub Releases](https://github.com/kenty227/m3u8DL-APP/releases) 下载对应系统的成品；开发者从本仓库获取源码。首次正式发布前，下载页可能暂时没有公开版本。

## 下载与安装

| 系统 | 选择的文件 | 使用方式 |
| --- | --- | --- |
| Windows x64 | `m3u8-Studio-版本-Windows.exe` | 双击运行便携应用 |
| macOS Intel | `m3u8-Studio-版本-macOS-x64.dmg` / `.zip` | 安装或解压到 Applications |
| macOS Apple Silicon | `m3u8-Studio-版本-macOS-arm64.dmg` / `.zip` | 安装或解压到 Applications |
| Linux x64 | `m3u8-Studio-版本-Linux-x86_64.AppImage` / `m3u8-Studio-版本-Linux-amd64.deb` | AppImage 加执行权限后运行；Debian / Ubuntu 可安装 deb |
| Linux arm64 | `m3u8-Studio-版本-Linux-arm64.AppImage` / `.deb` | 选择与 CPU 架构匹配的文件 |

成品包含 Electron、N_m3u8DL-RE 和 FFmpeg，**无需安装 Node.js 或手动配置下载工具**。GitHub 自动生成的 “Source code” 和项目的 `Source.zip` 用于开发，普通用户选择上表的成品文件。所有成品都使用各自系统提供的基础运行库。macOS 当前使用 ad-hoc 签名，尚未 Developer ID 签名或公证，可能被 Gatekeeper 阻止。

Windows 的实际下载、定时录制和界面已在本机验证；五个系统/架构已通过 GitHub 原生构建、实际下载、定时录制和打包后 MP4 解码测试。macOS / Linux 的完整桌面操作仍待实机验收，因此初期 Release 标记为预发布。支持系统与架构不代表兼容所有旧版系统或 Linux 发行版；Linux 构建以 Ubuntu 24.04 为基准。

Linux AppImage 示例：

```bash
chmod +x m3u8-Studio-1.2.0-Linux-x86_64.AppImage
./m3u8-Studio-1.2.0-Linux-x86_64.AppImage
```

Releases 的 `SHA256SUMS.txt` 提供附件校验值，`TOOLS.json` 记录各平台内置工具的准确版本与来源。更新记录见 [CHANGELOG.md](CHANGELOG.md)；二开与贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 使用

Windows 成品位于 `dist/m3u8-Studio-1.2.0-Windows.exe`，双击运行，无需安装 Node.js。macOS、Linux 使用对应系统与架构的构建产物。

1. 发行包已包含当前系统与架构的 N_m3u8DL-RE、FFmpeg 和 Electron，默认无需安装 Node.js、配置 PATH 或另行下载工具。**设置** 中的工具路径留空使用内置版本；填写绝对路径可切换自己的工具。开发环境缺少内置工具时才回退到系统 PATH。
2. **单次下载** 首页粘贴一个或多个 HTTP / HTTPS 媒体链接，每行一个，点击开始下载。链接不要求以 `.m3u8` 结尾，支持带鉴权查询参数的地址。
3. 展开 **下载参数** 可启用、关闭、修改、增加或移除参数。参数名称可下拉搜索本机引擎的 `--help` 列表，也可输入自定义选项；参数值单独填写，无需额外加命令行引号。
4. **设置** 可保存默认参数、参数值、默认下载目录与同时下载数量。初始默认参数为 `--auto-select` 和 `-M format=mp4`。设置对新任务生效，已有任务保留创建时的参数和工具路径。
5. **定时下载** 输入一个链接，可添加多组包含日期的开始与结束时间。支持跨天，不接受重叠或已过去的时间段。每组生成一个独立文件。

任务支持日志查看、打开目录、停止、重新下载及移除记录。移除记录不会删除已下载文件。下载日志可能包含链接令牌、Cookie 等信息，复制分享前请自行检查。

未指定文件名时自动附加任务 ID。批量下载即使设置了相同的 `--save-name`，也会附加各任务 ID，避免同时下载的同名播放列表覆盖文件。

## 定时任务行为

- 使用电脑的本地时区；保存为 UTC 时间，界面按本地时间显示。
- Windows / macOS 关闭窗口后继续在后台运行，可从托盘或 macOS Dock 打开；Linux 关闭窗口时最小化到任务栏，避免没有托盘的桌面环境无法恢复。完全退出请用应用菜单、托盘菜单或 Ctrl / ⌘ + Q。
- 需要应用运行、电脑开机并保持唤醒。应用不会主动唤醒电脑或安装系统服务。
- 到开始时间自动启动。定时任务独立于点播并发队列，避免等待其他下载。
- 到结束时间发送停止信号：Windows 通过隐藏控制台发送真实 Ctrl+C，macOS / Linux 对独立进程组发送 SIGINT，涵盖引擎和 FFmpeg 子进程。等待引擎停止与混流；最终文件生成可能晚于结束时间。
- 调度器管理起止时间，忽略定时任务中的 `--task-start-at`、`--live-record-limit`；媒体时长上限无法精确代表墙上时钟时间。定时任务自动开启 `--live-real-time-merge`，使用带时间戳和任务 ID 的独立文件名。
- 部分引擎版本收到 Ctrl+C / SIGINT 后会直接退出。对应用主动停止的定时录制，应用会使用 FFmpeg 将留下的实时合并 TS 轨道完成最终 MP4/MKV 混流，并保留原始文件；合并失败则标记为失败。复杂的自定义混流配置请确认所用引擎的行为。
- 超过 60 秒仍未停止会结束进程树，并将任务标记为失败，保留已有媒体与分片。
- 应用重启时，未来定时任务仍保留；已过期时间段标记为过期。已运行或排队的普通下载标记为中断，可手动重新下载。
- 同一直播流如果自行结束，任务可以在预定结束时间前完成。

## 开发与构建

需要 Node.js 22.12 或更高版本，推荐 Node.js 24。Windows 原生控制组件使用系统 .NET Framework 的 C# 编译器，首次启动 / 构建时自动编译，无需 .NET SDK。

```powershell
npm ci
npm start
npm test
npm run build
```

若 Electron 官方下载速度较慢，可仅在安装命令的当前终端使用镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install
```

开发用的预编译 FFmpeg 下载较慢时，可临时设置 `M3U8_FFMPEG_MIRROR=https://cdn.npmmirror.com/binaries/ffmpeg-static`，仍需通过 SHA-256 校验。所有发行构建均从固定版本的官方源码编译 LGPL FFmpeg，关闭 GPL、nonfree 和外部编解码库；成品运行时不下载或编译工具。源码构建需要 C 编译器和 make：Windows 使用 MSYS2 MINGW64，macOS 使用 Xcode Command Line Tools，Linux 使用 GCC / make，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。Apple Silicon 开发启动也使用源码编译，避免使用上游 nonfree 二进制；其他平台开发启动可使用预编译工具。

`npm run build` 构建当前系统与当前 CPU 架构。在目标系统执行以下命令：

| 系统 | 架构 | 命令 | 输出 |
| --- | --- | --- | --- |
| Windows | x64 | `npm run build:win` | 便携 `.exe` |
| macOS（Intel） | x64 | `npm run build:mac -- --x64` | `.dmg` 和 `.zip` |
| macOS（Apple Silicon） | arm64 | `npm run build:mac -- --arm64` | `.dmg` 和 `.zip` |
| Linux | x64 / arm64 | `npm run build:linux -- --x64` / `--arm64` | `.AppImage` 和 `.deb` |

构建脚本要求在对应系统运行，避免误用另一系统的 Electron 运行时。Linux AppImage 下载后需要执行权限；`.deb` 用于 Debian / Ubuntu 系发行版。macOS / Linux 不依赖 Windows 的 C# 控制组件。

`.github/workflows/build.yml` 配置了 Windows x64、macOS x64 / arm64、Linux x64 / arm64 五个原生构建任务。每个任务运行单元测试、使用官方 v0.6.0-beta 引擎完成本地点播及定时录制测试，构建内置工具的安装包，再在移除开发工具 PATH 的环境中测试点播、定时录制及 MP4 解码，最后上传安装包。普通 push、Pull Request 和手动触发只产生 Actions artifacts。推送与 `package.json` 版本一致的 `v版本` 标签后，五个任务全部通过才会汇总成品、应用源码、工具信息和 SHA-256 校验值，先建立草稿并核对附件，再自动公开为 **GitHub 预发布版**，普通用户可以直接下载。流程不依赖个人访问令牌，使用当前仓库的 `GITHUB_TOKEN`。

发布步骤见 [docs/RELEASING.md](docs/RELEASING.md)。每个发行构建同时输出 `FFmpeg-6.1.6-Source.tar.xz`；汇总任务核对五个平台的源码与固定 SHA-256，一并提供未修改的官方源码、应用 Source.zip 中的构建脚本和 TOOLS.json 中的构建配置。

当前本机为 Windows，已验证 Windows 的实际下载、定时录制和 UI。macOS / Linux 的兼容代码与构建配置已提供，原生运行及安装包验证需要对应机器或上述 CI，尚不能视为完成实机验收。macOS 默认使用本地 ad-hoc 签名，以满足 Apple Silicon 的运行要求；没有发行用 Developer ID 签名或公证。公开分发前可配置证书，并覆盖 `mac.identity`、启用 `mac.hardenedRuntime` 和公证配置。

构建自动下载并校验 `scripts/tools-manifest.json` 中固定版本、固定 SHA-256 的工具，打包到 `resources/tools`。工具下载和缓存只存在于项目 `.build`，不引用开发者电脑的安装目录；首次开发启动和构建需要联网。Linux 原生打包建议安装 `libfuse2`、`libarchive-tools`；桌面运行仍需要发行版提供的系统库。Windows 使用系统 .NET Framework 4.x 运行隐藏控制组件；仅源码构建需要 C# 编译器，成品无需编译工具。

验证命令：

```powershell
npm test                  # 参数、队列、调度与恢复测试
npm run smoke             # 本地 HLS 点播与定时录制，验证 MP4 可播放
npm run test:ui           # 实际 Electron 界面交互与截图
npm run test:portable     # 使用打包目录中的工具，移除本机工具 PATH 后验证
```

`smoke` 需要 PATH 中存在 FFmpeg、FFprobe 与 N_m3u8DL-RE，并先运行 `node scripts/build-native.cjs`。UI 测试复用 `.smoke/media` 的本地测试流，请先执行 `smoke`，使用独立的测试配置目录，不修改正常应用的设置。测试产物位于 `.smoke` 和 `artifacts`。

## 分享给其他人

- **普通用户**：分享对应系统与 CPU 架构的发行包。Windows 分享 `dist/m3u8-Studio-1.2.0-Windows.exe` 即可；无需携带项目目录、Node.js 或开发者的用户配置。macOS / Linux 需使用对应安装包，尚待原生机器或 CI 验证。不能把 Windows EXE 当作三系统通用程序。
- **开发者**：运行 `npm run share:source`，分享 `dist/m3u8-Studio-1.2.0-Source.zip`。解压后安装 Node.js 22+，运行 `npm ci`、`npm start`；首次启动自动准备当前系统的工具。按前述命令构建即可生成成品。
- 源码分享包使用固定文件白名单，包含源代码、脚本、测试、CI、锁文件和许可说明；不包含 `node_modules`、`.build`、`.smoke`、`artifacts`、已有下载、日志或用户数据。请分享该 ZIP，避免直接压缩整个开发目录。
- 每位用户的配置、任务和日志分别保存在自己的用户数据目录。内置工具采用相对于当前应用目录的定位方式，自动模式的定时任务不会固定上次便携包的临时解压路径。引擎日志写到任务临时目录，兼容只读安装目录。
- 应用代码采用 MIT 许可；发行包中的引擎、FFmpeg、Electron 保留各自许可。发行 FFmpeg 使用 LGPL 配置，不引入外部编解码库，并提供完整对应源码附件、构建脚本和配置。再分发时保留这些附件和许可文本，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。开发用的旧版预编译工具与此前本地产物使用不同许可，请用当前源码构建生成发行版本。

## 实现

| 文件 | 职责 |
| --- | --- |
| `src/main.cjs` | 窗口、托盘、受限 IPC、原生文件选择 |
| `src/preload.cjs` | 上下文隔离的最小接口 |
| `src/core.cjs` | 参数帮助解析、链接与时间段校验、参数构建 |
| `src/service.cjs` | 下载队列、定时调度、状态保存、停止与兼容混流 |
| `src/platform.cjs` | 系统工具 PATH、执行权限、Unix 进程组控制 |
| `src/renderer` | 三模块中文界面 |
| `native/Runner.cs` | 独立隐藏控制台、UTF-8 日志和真实 Ctrl+C |

命令通过参数数组启动，关闭 shell 执行，保留带空格的路径与请求头。渲染进程禁用 Node.js，开启上下文隔离、沙箱和 CSP。应用数据通过 Electron 的 `userData` 路径保存为 `state.json`，一般位于 Windows 的 `%APPDATA%/m3u8-studio`、macOS 的 `~/Library/Application Support/m3u8-studio`、Linux 的 `~/.config/m3u8-studio`（遵循 XDG 配置）。采用写临时文件再替换的方式保存，异常配置会备份。

## 致谢与许可

下载引擎：[N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE)，MIT 许可；媒体混流：[FFmpeg](https://ffmpeg.org/)。本项目界面与应用代码采用 MIT 许可。第三方工具保留各自许可。
