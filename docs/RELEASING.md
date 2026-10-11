# GitHub 仓库与版本发布

仓库：**kenty227/m3u8DL-APP**。开发者 Fork MIT 应用源码，普通用户从 Releases 下载包含引擎和 FFmpeg 的成品。

## 首次上传

在 GitHub 创建公开空仓库，项目已包含 README、LICENSE 和 .gitignore，不勾选自动生成。首次上传命令：

```bash
git init -b main
git add .
git status --short
git commit -m "Initial release of m3u8 Studio"
git remote add origin git@github.com:kenty227/m3u8DL-APP.git
git push -u origin main
```

HTTPS 登录也可使用 `https://github.com/kenty227/m3u8DL-APP.git`。不要把令牌写入文件或远端地址；既有仓库使用现有历史，不强制覆盖。提交只包含代码、锁文件、文档、图标、测试和 GitHub 配置；缓存、成品、测试媒体、用户数据、环境变量和签名证书均已忽略。

## 自动构建

Actions 的 **Desktop builds** 在 Windows x64、macOS x64 / arm64、Linux x64 / arm64 上执行单元测试、实际点播与定时录制、原生打包及打包后媒体解码测试。发行 FFmpeg 始终从官方固定版本源码编译，关闭 GPL、nonfree 和外部库自动检测。CI 安装编译工具，普通用户无需编译器、Node.js 或自行下载工具。

普通分支、PR 和手动运行上传 Actions artifacts。每个平台的 artifact 同时包含安装包、tools-manifest.json 和完整 FFmpeg 对应源码。测试媒体生成使用 CI 的开发工具；真实下载、定时停止、混流和 MP4 解码使用打包工具，并移除开发工具 PATH。

## 创建 Release 草稿

更新 `package.json` 和锁文件的版本，例如 `npm version 1.2.1 --no-git-tag-version`，并在 CHANGELOG.md 添加 `## 1.2.1`。提交并推送代码，确认主分支 CI 正常，然后推送完全一致的版本标签：

```bash
git tag -a v1.2.0 -m "m3u8 Studio 1.2.0"
git push origin v1.2.0
```

标签不匹配、任一平台构建或媒体验证失败都不会生成 Release。五个平台全部通过后，汇总任务自动附上：

- 九个系统安装/便携文件。
- 应用 Source.zip，含源码、测试、文档及完整 FFmpeg 构建脚本。
- `FFmpeg-6.1.6-Source.tar.xz`，与实际编译使用的未修改官方源码相同。
- `TOOLS.json`，包括各平台编译器、版本、配置、来源与哈希。
- `SHA256SUMS.txt`，校验所有下载附件。

汇总脚本逐一校验五个平台的工具版本、架构、LGPL 配置与 FFmpeg 源码 SHA-256；缺失或不匹配的对应源码不能进入 Release。不需要额外设置 `DISTRIBUTION_READY`，源码准备和验证已由构建流程完成。

流程仅在汇总任务使用 `contents: write`，通过当前仓库 `GITHUB_TOKEN` 操作，无需个人令牌。Fork 的标签在 Fork 自己的仓库生成草稿。组织策略限制 Actions 或 token 写入时，需要维护者在组织配置中允许对应功能。

重跑会替换同版本草稿附件和说明，拒绝替换已正式发布的 Release。已发布版本修复需要增加版本号。草稿只对维护者可见；在 Releases 查看附件、说明和测试结果，确认后点击 **Publish release**，普通用户即可下载。

## 分发与桌面验收

对外分发时保留 FFmpeg 对应源码、构建脚本、构建配置和许可文本。应用 Source.zip 与 FFmpeg 完整源码为两个独立附件；不能只提供应用源码。更换工具或启用外部库时重新确认对应源码和许可要求。参考 [FFmpeg 官方说明](https://ffmpeg.org/legal.html) 和 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

CI 媒体验证不代替完整桌面验收。macOS / Linux 仍需确认实际安装、桌面启动、目录选择及后台录制。macOS 默认 ad-hoc 签名，尚未 Developer ID 签名或公证；Windows 也没有发行者证书签名。证书与密码放在 Secrets，不提交源码。首次公开版本可标记预发布并说明这些限制。

## 本地汇总检查

将同一次构建的五个 artifacts 解压到 `.build/release-artifacts`，保留 `m3u8-Studio-win-x64` 等独立文件夹，然后执行：

```bash
npm run share:source
npm run release:prepare
```

输出为 `.build/release`，包含附件、校验文件和 RELEASE_NOTES.md。输出目录必须为空，避免旧成品混入。Release 说明不作为下载附件上传。
