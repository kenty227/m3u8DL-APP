# m3u8 Studio

基于 [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE) 的中文桌面媒体下载应用，使用 Electron 构建，支持 Windows、macOS 和 Linux。

应用代码采用 [MIT 许可](LICENSE)，欢迎 Fork、修改和贡献。下载、安装与使用无需开发环境；二次开发说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 功能

- **单次下载**：粘贴一个或多个媒体链接，每行一个；支持下载队列、日志查看、停止和重新下载。
- **下载参数**：折叠面板中配置参数，默认启用 `--auto-select` 和 `-M format=mp4`；支持搜索当前使用的引擎所提供的参数，也可输入自定义选项。
- **定时下载**：为单个链接设置多组开始、结束时间，默认关闭实时合并和结束后合并，每个时间段独立保留分片。
- **设置**：保存默认参数及参数值、下载目录、并发数量，以及可选的引擎和 FFmpeg 路径。

## 下载与安装

前往 [GitHub Releases](https://github.com/kenty227/m3u8DL-APP/releases) 查看公开版本、更新说明和下载附件。当前公开版本为 [v1.2.1 预发布版](https://github.com/kenty227/m3u8DL-APP/releases/tag/v1.2.1)，对应下载如下：

| 系统与架构 | v1.2.1 下载 | 使用方式 |
| --- | --- | --- |
| Windows x64 | [便携 EXE](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-Windows.exe) | 下载后双击运行 |
| macOS Intel（x64） | [DMG](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-macOS-x64.dmg) / [ZIP](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-macOS-x64.zip) | 将应用复制到 Applications |
| macOS Apple Silicon（arm64） | [DMG](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-macOS-arm64.dmg) / [ZIP](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-macOS-arm64.zip) | 将应用复制到 Applications |
| Linux x64 | [AppImage](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-Linux-x86_64.AppImage) / [DEB](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-Linux-amd64.deb) | AppImage 添加执行权限；Debian / Ubuntu 可安装 DEB |
| Linux arm64 | [AppImage](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-Linux-arm64.AppImage) / [DEB](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/m3u8-Studio-1.2.1-Linux-arm64.deb) | 选择与系统架构匹配的文件 |

发行包已包含 Electron、N_m3u8DL-RE 和 FFmpeg，**无需安装 Node.js、配置 PATH 或单独下载这些工具**。GitHub 自动生成的 “Source code” 压缩包与项目的 `Source.zip` 是源码包，不是可直接运行的应用。

Linux x64 AppImage 运行示例，在下载文件所在目录执行：

```bash
chmod +x m3u8-Studio-1.2.1-Linux-x86_64.AppImage
./m3u8-Studio-1.2.1-Linux-x86_64.AppImage
```

下载页同时提供 [SHA256SUMS.txt](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/SHA256SUMS.txt) 和 [TOOLS.json](https://github.com/kenty227/m3u8DL-APP/releases/download/v1.2.1/TOOLS.json)，分别用于核对附件校验值、查看内置工具的版本与来源。

### 兼容性与验证范围

- 提供 Windows x64、macOS x64 / arm64、Linux x64 / arm64 五个构建目标；各系统使用独立发行包。
- 五个目标已通过原生 CI 构建，以及真实点播、定时录制和打包后 MP4 解码测试。CI 配置与执行记录见 [GitHub Actions](https://github.com/kenty227/m3u8DL-APP/actions/workflows/build.yml)。macOS / Linux 的完整桌面交互仍需实机验收，当前版本标记为预发布。
- Windows 发行包未做发行者签名；macOS 使用 ad-hoc 签名，尚未使用 Developer ID 签名或公证，系统可能显示安全提示或阻止启动。
- 运行仍需要操作系统提供的基础运行库。Windows 控制组件使用 .NET Framework 4.x；Linux 构建以 Ubuntu 24.04 为基准，AppImage 可能需要 FUSE。支持上述目标不代表兼容所有旧版操作系统或 Linux 发行版。

## 使用

1. 启动对应系统的发行包。在 **设置** 中选择下载目录；工具路径留空时使用内置版本，填写可执行文件的绝对路径时使用指定工具。
2. 在 **单次下载** 首页粘贴一个或多个 HTTP / HTTPS 媒体链接，每行一个，点击开始下载。链接不要求以 `.m3u8` 结尾，支持带鉴权查询参数的地址。
3. 展开 **下载参数**，按需启用、关闭、修改、增加或移除选项。参数名称可搜索，参数值单独填写，无需额外添加命令行引号。
4. 在 **设置** 中保存默认参数、参数值、默认下载目录与同时下载数量。设置对新任务生效，已有任务保留创建时的参数和工具路径。
5. 在 **定时下载** 中输入一个链接，添加包含日期的开始与结束时间。支持多组时间和跨天，不接受重叠或已过去的时间段。

任务支持查看日志、打开目录、停止、重新下载及移除记录。移除记录不会删除已下载文件。未指定文件名时自动附加任务 ID；批量下载设置相同的 `--save-name` 时也会附加任务 ID，避免文件覆盖。

新建下载与定时任务的分片保存在所选下载目录内的 `segments_任务ID` 文件夹，不再默认写入应用数据目录。各任务使用独立目录，避免同时下载时混放分片；已有任务继续使用原保存路径。

每位用户的设置、任务和日志保存在自己的应用数据目录；内置工具通过应用的相对资源路径定位。运行发行包无需作者的目录、环境变量或用户配置。日志可能包含链接令牌、Cookie 等信息，报告问题或分享日志前请脱敏。

### 定时任务行为

- 时间按电脑的本地时区输入和显示，内部保存为 UTC。
- 定时任务需要应用运行、电脑开机并保持唤醒。应用不会主动唤醒电脑或安装系统服务。
- Windows / macOS 关闭窗口后继续在后台运行，可从托盘或 macOS Dock 打开；Linux 关闭窗口时最小化到任务栏。完全退出可使用应用菜单、托盘菜单或 Ctrl / ⌘ + Q。
- 到开始时间自动启动，独立于点播并发队列。到结束时间请求停止录制，默认保留分片，不自动合并。
- 新建定时任务沿用默认下载参数中的其他设置，但默认关闭 `--live-real-time-merge`、`--live-pipe-mux` 和 `-M / --mux-after-done`，启用 `--skip-merge`、`--live-keep-segments` 和 `--del-after-done false`。这些默认值对新建定时任务生效，已有任务保留原参数。
- 如需自动合并，可在录制参数中关闭 `--skip-merge`，按需启用 `--live-real-time-merge` 和 `-M format=mp4`。启用跳过合并时，应用也会跳过最终 FFmpeg 混流。
- 调度器管理起止时间，忽略定时任务中的 `--task-start-at` 和 `--live-record-limit`。每个时间段使用带时间戳和任务 ID 的独立名称。
- 选择实时合并与最终混流时，对主动停止后留下的 TS 轨道，应用使用 FFmpeg 完成 MP4 / MKV 混流并保留原始文件；合并失败则标记为失败。复杂的自定义混流配置需确认所用引擎的行为。
- 超过 60 秒仍未停止时结束进程树，将任务标记为失败并保留已有媒体与分片。直播流自行结束时，任务可在预定结束时间前完成。
- 应用重启后保留未来的定时任务，已过期的时间段标记为过期；已运行或排队的普通下载标记为中断，可手动重新下载。

## 源码开发

需要 Git 和 Node.js 22.12 或更高版本，推荐 Node.js 24。克隆主仓库或自己的 Fork：

```bash
git clone https://github.com/kenty227/m3u8DL-APP.git
cd m3u8DL-APP
npm ci
npm start
```

首次安装和启动需要联网准备 Electron 与当前系统的工具。工具来源、版本及 SHA-256 固定在 [scripts/tools-manifest.json](scripts/tools-manifest.json)，下载缓存位于克隆项目的 `.build` 目录。

Windows 开发环境通过系统 .NET Framework 的 C# 编译器生成控制组件，无需 .NET SDK；Apple Silicon 开发启动需 Xcode Command Line Tools 编译 FFmpeg。其他平台开发启动可使用预编译工具。完整环境配置见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 构建与测试

发行构建从固定版本的官方 FFmpeg 源码编译，需要 C 编译器和 make：Windows 使用 MSYS2 MINGW64，macOS 使用 Xcode Command Line Tools，Linux 使用 GCC / make。安装步骤见 [构建自己的版本](CONTRIBUTING.md#构建自己的版本)。

`npm run build` 构建当前系统与 CPU 架构，也可在对应系统执行以下命令：

| 系统 | 架构 | 命令 | 生成格式 |
| --- | --- | --- | --- |
| Windows | x64 | `npm run build:win` | 便携 EXE |
| macOS | x64 | `npm run build:mac -- --x64` | DMG、ZIP |
| macOS | arm64 | `npm run build:mac -- --arm64` | DMG、ZIP |
| Linux | x64 | `npm run build:linux -- --x64` | AppImage、DEB |
| Linux | arm64 | `npm run build:linux -- --arm64` | AppImage、DEB |

安装包生成到**当前克隆项目的 `dist/` 目录**。该目录是构建输出，不提交到 Git；公开成品通过 GitHub Releases 分发。构建缓存、依赖、测试产物、下载媒体和用户数据也不包含在源码仓库中。

```bash
npm test                  # 参数、队列、调度与恢复等单元测试
npm run smoke             # 测试 HLS 点播、定时录制及 MP4 解码
npm run test:ui           # Electron 界面交互测试
npm run test:portable     # 验证打包后的工具与媒体下载
```

媒体集成测试需要准备 FFmpeg、FFprobe 和测试用引擎；UI 测试使用媒体测试生成的 HLS 流，打包测试需先完成构建。具体准备命令和验证要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 持续集成与发布

[构建工作流](.github/workflows/build.yml) 在五个目标系统与架构上运行单元测试、媒体集成测试和打包验证。开发分支和 Pull Request 的产物通过 Actions artifacts 提供；公开下载以 Releases 为准。

维护者推送与 `package.json` 版本一致的 `v版本` 标签后，发布流程在五个构建通过后汇总安装包、应用源码、FFmpeg 对应源码、工具信息和校验文件，并公开为预发布版。发布权限、签名和验收说明见 [docs/RELEASING.md](docs/RELEASING.md)。

## 代码结构

| 位置 | 职责 |
| --- | --- |
| [src/main.cjs](src/main.cjs) / [src/preload.cjs](src/preload.cjs) | Electron 生命周期、窗口与受限 IPC |
| [src/core.cjs](src/core.cjs) | 参数解析、链接与时间段校验 |
| [src/service.cjs](src/service.cjs) | 下载队列、定时调度、状态保存与混流 |
| [src/platform.cjs](src/platform.cjs) / [native/Runner.cs](native/Runner.cs) | 系统差异与进程控制 |
| [src/renderer](src/renderer) | 三模块中文界面 |
| [scripts](scripts) | 工具准备、构建、测试和发布脚本 |
| [tests](tests) | 单元测试 |

命令通过参数数组启动，禁用 shell 执行。渲染进程禁用 Node.js，启用上下文隔离、沙箱和 CSP。应用数据通过 Electron 的 `userData` 目录保存，与源码和安装目录分离。

## 贡献与问题反馈

欢迎通过 Fork 和 Pull Request 提交改进，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

通过 [Issues](https://github.com/kenty227/m3u8DL-APP/issues) 报告问题时，请提供应用版本、操作系统、CPU 架构、复现步骤和脱敏日志。更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可与致谢

应用界面与代码采用 [MIT 许可](LICENSE)。下载引擎 [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE)、[FFmpeg](https://ffmpeg.org/) 和 [Electron](https://www.electronjs.org/) 保留各自许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

发行版内置 FFmpeg 使用 LGPL 配置，关闭 GPL、nonfree 和外部库自动检测。Release 提供完整对应源码附件，应用源码中包含构建脚本，`TOOLS.json` 记录各平台配置。再分发时请保留相关许可、对应源码和构建信息。
