# GitHub 仓库与版本发布

目标仓库：**kenty227/m3u8DL-APP**。仓库提供 MIT 应用源码供开发者 Fork，Releases 提供普通用户直接运行的安装包。

## 首次上传

在 GitHub 创建公开空仓库 `m3u8DL-APP`。不要勾选自动生成 README、LICENSE 或 .gitignore，本项目已包含这些文件。在项目目录执行：

```bash
git init -b main
git add .
git status --short
git commit -m "Initial release of m3u8 Studio"
git remote add origin https://github.com/kenty227/m3u8DL-APP.git
git push -u origin main
```

提交列表应只包含代码、锁文件、文档、图标、测试和 GitHub 配置。`.gitignore` 已排除缓存、成品、媒体测试、用户数据、环境变量和签名证书。既有仓库使用现有历史，不强制推送覆盖远端。推送需要仓库的写权限和正常 GitHub 登录；不要把令牌写入远端 URL 或文件。

主分支首次推送后，在 Actions 的 **Desktop builds** 中查看五个原生系统/架构任务。所有任务会进行单元测试、实际点播与定时录制、打包及内置工具测试。默认不上传二进制，避免在对应源码尚未准备时通过公开 Actions artifacts 分发内置 FFmpeg。按下文完成分发准备并设置 `DISTRIBUTION_READY=true` 后，普通分支、PR 和手动运行的成品保存在 Actions artifacts，版本标签生成 Release 草稿；普通用户使用正式 Releases 页面。

## 创建版本草稿

1. 更新 `package.json` 和锁文件的版本，例如 `npm version 1.2.1 --no-git-tag-version`，并在 CHANGELOG.md 添加 `## 1.2.1`。
2. 提交并推送代码；先确认主分支 CI 正常。
3. 推送与包版本完全一致的标签。首个版本示例：

```bash
git tag -a v1.2.0 -m "m3u8 Studio 1.2.0"
git push origin v1.2.0
```

标签不一致会失败；任何平台构建或媒体验证失败都不会创建 Release。已设置 `DISTRIBUTION_READY=true` 且全部通过后，自动汇总九个系统安装/便携文件、应用 `Source.zip`、`TOOLS.json` 和 `SHA256SUMS.txt`，创建 **Release 草稿**。未设置变量时只构建和测试。工具清单包括各架构真实 FFmpeg 版本、构建配置、上游 URL 和哈希；同一个 ffmpeg-static 发布标签中的平台工具版本可能不同。

流程仅在 Release 汇总任务使用 `contents: write`，通过内置 `GITHUB_TOKEN` 操作当前仓库，无需维护个人访问令牌。公开仓库默认可以使用 Actions；组织策略禁用 Actions 或禁止写权限时，先在仓库/组织配置中允许对应功能。Fork 的标签会在 Fork 自己的仓库生成草稿。

重跑会替换同版本的草稿附件和说明，**拒绝替换已经正式发布的 Release**。正式版本修复请增加版本号并推送新标签。草稿仅维护者可见；它不会出现在普通用户的公开下载列表。

## 正式公开前的准备

内置 FFmpeg 包含 GPL 构建。本仓库当前保留许可文本、上游构建信息和工具哈希，**尚未包含五个目标 FFmpeg 及全部静态依赖的完整对应源码包**。公开分发前，在同一 Release 附上与具体二进制匹配的对应源码、必要补丁、依赖源码、构建脚本和许可说明；不能仅用应用 `Source.zip` 或最新版 FFmpeg 仓库链接代替。按 TOOLS.json 的各平台构建配置追溯所需内容。可选择自行构建工具以明确控制版本和依赖，同时更新准备脚本、哈希与媒体验证。

许可参考：[FFmpeg 官方分发说明](https://ffmpeg.org/legal.html)、[GPLv3 第 6 条](https://www.gnu.org/licenses/gpl-3.0.html#section6)；组件清单见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。对应源码准备完毕后，将草稿说明中的维护者检查段替换为源码附件链接，并把新增附件哈希加入 SHA256SUMS.txt。自动草稿流程不会验证手工添加源码包的完整性，这需要维护者确认。

先将完整对应源码和构建说明放在本仓库公开可下载的位置，例如一个专门的第三方源码 Release，并确认与 `scripts/tools-manifest.json` 的二进制逐一匹配。之后在仓库 **Settings → Secrets and variables → Actions → Variables** 设置 `DISTRIBUTION_READY` 为 `true`，再推送版本标签或重跑对应流程。该变量表示维护者已完成分发准备，不是自动许可审查；更新工具后要重新确认源码匹配。代码本身可以立即开源，不需要这个变量。

验证 macOS / Linux 的真实桌面启动、安装、下载目录选择和后台定时录制。CI 媒体测试不能代替完整桌面验收。macOS 当前只做 ad-hoc 签名；正式发布可配置 Developer ID 证书、公证与 Hardened Runtime。证书和密码只放仓库 Secrets，不提交源码。Windows 成品也尚未做发行者证书签名。

在 GitHub Releases 编辑草稿，完成上述准备后点击 **Publish release**。随后 README 的 Releases 链接可供普通用户下载，无需 Git、Node.js 或源码构建。仓库可公开源码而继续保留二进制草稿，直到对应源码和实机验收完成。

## 本地检查汇总脚本

将同一次构建的五个 Actions artifacts 解压到 `.build/release-artifacts`，保留 `m3u8-Studio-win-x64` 等各自文件夹，每个文件夹包含安装包与 `tools-manifest.json`。然后执行：

```bash
npm run share:source
npm run release:prepare
```

输出为 `.build/release`，包含附件、校验文件和 `RELEASE_NOTES.md`。脚本拒绝缺失目标、错误工具版本、错误架构、哈希清单不一致和已有非空输出目录，避免旧成品混入。再次准备时使用全新目录/干净 CI 工作区。发布说明不作为下载附件上传。
