# 发布下载版

打一个版本标签，GitHub 就自己构建下载版、建好 Release。流程写在 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

它只管能下载的文件：签名的 Android APK 和网页静态包。网站由 [deploy-site.yml](DEPLOY.md) 在 `main` 合并后自动发布。iOS 走 TestFlight，不在这里。

## 每个 Release 里有什么

| 文件 | 内容 |
|---|---|
| `WronglyDrawn-<版本>-android.apk` | 签名的安卓安装包，安卓 8.0 以上，离线可玩 |
| `WronglyDrawn-<版本>-web.zip` | 网页版静态文件（相对路径），给自己架设的人 |
| `SHA256SUMS.txt` | 上面两个文件的 SHA-256 |

发行说明的开头来自 [`.github/release-notes.md`](../.github/release-notes.md)，后面接 GitHub 自动列出的合并记录。

## 发一个新版本

1. 开一个 PR，把 `package.json` 的 `version` 改成新版本（`package-lock.json` 开头两处一起改）。版本只写在这里。
2. PR 通过 `Check game builds` 后合并。
3. 想先试一遍：**Actions** → **Release** → **Run workflow**（分支选 `main`）。它构建并自查，文件留在这次运行的 **Artifacts** 里，不发 Release。
4. 在 `main` 上打标签并推上去：

   ```bash
   git tag v0.2.3
   git push origin v0.2.3
   ```

   标签必须是 `v` 加上 `package.json` 的版本，否则流程会停下。

几分钟后 **Releases** 页面出现新版本。

## 版本号规则

- `versionName` 就是 `package.json` 的版本。
- `versionCode` = 主版本×10000 + 次版本×100 + 修订号。`0.2.2` 是 `202`。
- 安卓只接受更大的 `versionCode` 覆盖安装。TapTap 或其他渠道上传的 APK 也用这个序列。2026-11 之前各渠道用过 10–12，从 0.2.2（202）起统一到这个规则，之后的上传不得小于 203。

## 签名

APK 的包名（`game.taptap.wronglydrawn`）和签名证书从第一版起就固定。换了它们，玩家没法覆盖安装，进度会丢。

签名用的密钥放在 GitHub 的 **Environment** `android-release` 里：**Settings** → **Environments** → `android-release`。这个环境只对 `v*` 标签和 `main` 分支开放，别的分支和别人的 PR 拿不到它。

| 名字 | 类型 | 内容 |
|---|---|---|
| `ANDROID_KEYSTORE_B64` | 环境密钥 | 签名库（PKCS#12）文件的 base64 |
| `ANDROID_STORE_PASSWORD` | 环境密钥 | 签名库密码 |
| `ANDROID_KEY_ALIAS` | 环境密钥 | 钥匙别名 |
| `ANDROID_KEY_PASSWORD` | 环境密钥 | 钥匙密码 |
| `ANDROID_CERT_SHA256` | 仓库变量 | 签名证书的 SHA-256，小写、不带冒号。流程拿它核对每个 APK，对不上就停 |

签名库的原件由作者离线保管。丢了它就再也发不了能覆盖安装的版本，务必另存一份备份。

## 出了问题

- 标签打错了：在 **Releases** 里删掉那个版本，再删掉标签（`git push origin :refs/tags/v0.2.3`），改好后重打。
- 想收回某个版本：在 **Releases** 里删掉它，或者编辑成 Pre-release。已经下载的人不受影响。

## English

Pushing a tag `v<version>` (it must match `package.json`) runs `.github/workflows/release.yml`: it builds a signed Android APK and a self-hostable web zip, checks the APK against the repository variable `ANDROID_CERT_SHA256`, writes `SHA256SUMS.txt` and publishes a GitHub Release. Running the workflow by hand on `main` builds and checks the same files and keeps them as run artifacts without publishing. Signing secrets live in the `android-release` environment, open only to `v*` tags and `main`. `versionCode` is major×10000 + minor×100 + patch, shared by every Android channel.
