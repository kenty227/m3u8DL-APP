# 二次开发与贡献

仓库：https://github.com/kenty227/m3u8DL-APP

应用代码采用 MIT 许可，可以 Fork、修改、再分发。修改或再分发时保留 LICENSE；下载引擎、FFmpeg 和 Electron 使用各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 启动开发环境

安装 Node.js 22.12+ 和 Git，推荐与 CI 一致的 Node.js 24。克隆自己的 Fork 或主仓库：

```bash
git clone https://github.com/kenty227/m3u8DL-APP.git
cd m3u8DL-APP
npm ci
npm start
```

首次启动会联网准备锁定版本的 Electron 和当前系统的工具，下载资源通过 SHA-256 校验，缓存到项目 `.build`。Windows / Linux / Intel Mac 开发启动使用预编译工具；Apple Silicon 自动从官方源码编译 FFmpeg，需要 Xcode Command Line Tools。无需作者电脑的安装路径或用户配置。Windows 使用系统 .NET Framework 的 C# 编译器生成控制组件，无需 .NET SDK；macOS / Linux 不使用该组件。

Git 不包含 `node_modules`、构建缓存、原生生成文件、安装包、下载媒体、日志和用户任务。依赖版本由 `package-lock.json` 锁定，使用 `npm ci` 重建。FFmpeg 镜像只在上游慢时按 README 临时配置，不写入仓库或用户设置。

## 代码结构

| 位置 | 负责内容 |
| --- | --- |
| `src/renderer/` | 单次下载、定时下载、设置页面 |
| `src/main.cjs` / `src/preload.cjs` | Electron 生命周期与受限 IPC |
| `src/core.cjs` | 参数、URL 和时间段处理 |
| `src/service.cjs` | 队列、调度、持久化与录制停止 |
| `src/platform.cjs` / `native/Runner.cs` | 系统差异与进程控制 |
| `scripts/tools-manifest.json` / `prepare-tools.cjs` | 锁定工具来源、哈希和许可 |
| `scripts/build*.cjs` | 当前系统构建 |
| `scripts/release.cjs` | 汇总五个构建、校验附件、创建 Release 草稿 |
| `tests/` / `scripts/*smoke.cjs` | 单元测试与实际媒体测试 |

界面通过 preload 提供的接口调用主进程；不要在渲染进程开放 Node.js、关闭上下文隔离，或通过 shell 拼接用户输入。新增引擎选项通常可通过应用的自定义参数功能使用，无需修改代码。

## 提交修改

从 Fork 创建分支，完成修改后提交 Pull Request，描述解决的问题、使用步骤和验证结果。命令示例：

```bash
git switch -c feature/my-change
npm test
```

纯文档修改检查链接和命令即可。涉及下载、调度或进程控制时，运行本地媒体集成测试；涉及界面时执行 UI 测试或记录实际操作结果；涉及打包或工具定位时验证打包后的应用：

```bash
node scripts/build-native.cjs
node scripts/ci-engine.cjs
npm run smoke
npm run test:ui
npm run build
npm run test:portable
```

`smoke` 在开发环境需要 FFmpeg 和 FFprobe 可通过 PATH 运行。`ci-engine.cjs` 将固定版本的官方引擎放入测试位置。`test:ui` 使用 `smoke` 生成的测试流。测试使用 `.smoke` 独立数据，不修改正常应用配置。跨系统修改由 GitHub Actions 在五个目标上继续验证。

## 构建自己的版本

发行构建始终从固定版本的官方 FFmpeg 源码编译，不引入外部编解码库。准备 C 编译器和 make：

- Windows：安装 [MSYS2](https://www.msys2.org/)，在 MINGW64 终端执行 `pacman -S --needed make mingw-w64-x86_64-gcc`。在运行 npm 构建的 PowerShell 中设置 `$env:M3U8_MSYS2 = 'C:\msys64'`，按实际安装位置填写。该路径只用于编译，成品不引用它。
- macOS：执行 `xcode-select --install`，提供 clang 和 make。
- Debian / Ubuntu：执行 `sudo apt-get install build-essential`；其他发行版安装对应的 GCC / make。

首次编译需要几分钟，之后验证并复用 `.build/ffmpeg-source-build` 缓存。普通用户无需这些工具，CI 自动安装。完整配方为 `scripts/build-ffmpeg.cjs`，官方源码版本和 SHA-256 在 `scripts/tools-manifest.json`。内置 FFmpeg 用于封装和解码，未包含 libx264、libx265 等外部编码器；需要这些功能时在设置中选择自己的 FFmpeg，并遵守其许可。

在对应系统运行 `npm run build`，或使用 README 的系统和架构命令。输出位于 `dist`。修改应用名称、`appId` 或版本时同步检查 `package.json`、锁文件、图标、Release 文件命名与更新记录。维护自己的 Fork 时将 package.json 中的 repository、homepage、bugs 改为自己的地址。

更换工具版本必须更新来源、SHA-256、许可说明，并验证真实点播、定时录制和 MP4 解码。不要只修改版本字符串或取消哈希校验。对外分发请按 [发布文档](docs/RELEASING.md) 同时准备第三方对应源码。

## 报告问题

在 [Issues](https://github.com/kenty227/m3u8DL-APP/issues) 提供系统、CPU 架构、应用版本、复现步骤和经过脱敏的日志。避免上传真实 Cookie、Authorization、带令牌的播放链接、个人下载记录或整个用户配置目录。
