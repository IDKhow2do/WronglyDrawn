# 网站自动发布

`main` 一有新提交，GitHub 就自己把网站构建好并发上线。流程写在 [`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml)。它只管网页，各商店的包不走这里。

## 它做什么

1. 装依赖，做类型检查，用相对路径构建游戏（`vite build --base ./`）。
2. 用 `scripts/assemble-site.mjs` 拼出网站：落地页 `landing/` 在根部 `/`，游戏在 `/play/`，`/build.txt` 写这次的提交哈希。拼完自查入口和引用的文件。
3. 看仓库变量 `SITE_DEPLOY` 决定往哪儿发：

| `SITE_DEPLOY` | 结果 |
|---|---|
| 没设置 | 只构建和自查，什么都不发。刚合并进来时就是这个状态。 |
| `server` | 用 rsync 经 SSH 同步到自己的服务器，再从公开网址回验。**推荐。** |
| `pages` | 发到 GitHub Pages。备选，见文末。 |

触发条件：`main` 上改了游戏源码、素材、落地页或构建配置；或者在网页上手动点运行。只改文档不会触发。

## 为什么选自己的服务器

- 网址不变，不用动 DNS。
- 游戏里的“反馈”要把内容交给服务器上的接口（`/api/feedback`）。GitHub Pages 只能放静态文件，接不了。
- 国内访问 GitHub Pages 不稳定。

代价是要在 GitHub 上存一把只用于发布的 SSH 钥匙，下面一步步来。

## 开通（只做一次）

### 一、在自己电脑上准备钥匙

```bash
ssh-keygen -t ed25519 -f wd-deploy -N "" -C "github-deploy"
```

得到两个文件：`wd-deploy`（私钥，只交给 GitHub）和 `wd-deploy.pub`（公钥，放到服务器）。

把公钥加到服务器上发布用户的 `~/.ssh/authorized_keys` 末尾。不要用 root。推荐在前面加上限制，把这把钥匙锁在网站目录里：

```
restrict,command="/usr/bin/rrsync -wo -no-del -munge /网站根目录" ssh-ed25519 AAAA…（wd-deploy.pub 的内容）
```

这样它只能往这个目录里写文件，开不了终端，读不了也删不了东西，碰不到服务器上的其他服务。`rrsync` 随 rsync 3.2 以上一起装好（Ubuntu 在 `/usr/bin/rrsync`）。用了这一行，下面的 `DEPLOY_PATH` 填 `/`。

再取服务器的身份指纹（端口不是 22 时加 `-p 端口`）：

```bash
ssh-keyscan 你的服务器地址
```

输出里不以 `#` 开头的行等会儿要用，全部复制。服务器可能只有 RSA 一种身份。它让 GitHub 只连这台服务器，连到别的机器就停。

### 二、在 GitHub 上填密钥

仓库页面 → **Settings** → 左栏 **Secrets and variables** → **Actions** → **Secrets** 页签 → **New repository secret**。一个一个加：

| 名字 | 填什么 |
|---|---|
| `DEPLOY_SSH_KEY` | `wd-deploy` 文件的全部内容，包括首尾两行 |
| `DEPLOY_KNOWN_HOSTS` | 上面 `ssh-keyscan` 输出的那几行 |
| `DEPLOY_HOST` | 服务器地址，和 `ssh-keyscan` 用的写法一样 |
| `DEPLOY_USER` | 服务器上的发布用户名 |
| `DEPLOY_PORT` | SSH 端口。是 22 就不用加这一条 |

密钥存进去以后谁也看不到原文，日志里出现时会被打成 `***`。填完把电脑上的 `wd-deploy` 私钥删掉。

仓库是公开的，但这几个密钥只交给 `main` 上的发布流程。别人发来的 Pull Request 跑的是 `Check game builds`，拿不到密钥。所以 `main` 只接受审过的合并。

再切到同一页的 **Variables** 页签 → **New repository variable**，加一个变量（路径不是机密，放在变量里；放在密钥里时，日志会把每个路径都打成 `***`）：

| 名字 | 填什么 |
|---|---|
| `DEPLOY_PATH` | 钥匙用 `rrsync` 锁住时填 `/`。否则填网站根目录的绝对路径，就是现在放着网站 `index.html` 的那个目录，末尾不带 `/` |

### 三、先空跑一次

仓库页面 → **Actions** → 左栏 **Deploy site** → 右侧 **Run workflow** → **Run workflow**。

这时 `SITE_DEPLOY` 还没设置，它只构建。跑成绿色，说明构建这一半没问题。

### 四、打开开关

**Settings** → **Secrets and variables** → **Actions** → **Variables** 页签 → **New repository variable**：名字 `SITE_DEPLOY`，值 `server`。

再手动运行一次 **Deploy site**。最后一步 “Check the live site” 变绿，说明线上的 `/build.txt` 已经是这次的提交。之后每次合并到 `main` 都会自动发。

### 第一次上线前要知道的

- 根目录的入口页会从游戏换成落地页，游戏搬到 `/play/`。旧的入口页存进服务器的 `.previous/` 目录，旧的游戏文件留在原处。
- 服务器要能把 `/play/` 当成普通目录提供，并且 `/api/feedback` 仍然指向原来的反馈服务。
- 落地页上有 GitHub 按钮。它指向的仓库公开之前，访客点进去是 404。
- 服务器上要装有 `rsync`。

## 回滚

发布只加文件和换文件，从不删除，所以旧版本的资源都还在服务器上。

**办法一，在 GitHub 上点（常用）。** **Actions** → **Deploy site** → **Run workflow**，在输入框里填上一个好版本的提交哈希，运行。它会把那个版本重新发一遍。提交哈希在仓库的 **Commits** 页面里复制。只能回到合并了这套流程之后的提交。

**办法二，在服务器上换回入口页。** 每次发布前的入口页都在网站目录的 `.previous/<时间>-<提交>/` 里。进网站目录执行：

```bash
cp -a .previous/要回到的那一份/. ./
```

要回到“游戏在根目录”的旧布局，用最早的那一份。

**先停下自动发布。** 删掉变量 `SITE_DEPLOY`，或者 **Actions** → **Deploy site** → 右上角 **⋯** → **Disable workflow**。

想收回钥匙：在服务器的 `authorized_keys` 里删掉那一行。

## 在自己电脑上预览整个网站

```bash
VITE_FEEDBACK_URL=/api/feedback npm run build -- --base ./ --outDir /tmp/wd-game --emptyOutDir
node scripts/assemble-site.mjs /tmp/wd-game /tmp/wd-site
npx vite preview --outDir /tmp/wd-site
```

打开终端里显示的地址看落地页，后面加 `play/` 看游戏。

## 备选：GitHub Pages

适合放在公开仓库里做一个不花钱的镜像。

1. **Settings** → **Pages** → **Build and deployment** 的 **Source** 选 **GitHub Actions**。
2. 加仓库变量 `SITE_DEPLOY`，值 `pages`。不需要任何密钥。
3. 要用自己的域名：在 **Settings** → **Pages** → **Custom domain** 填域名，再到域名服务商那里加一条 CNAME 记录，指向 `<GitHub 用户名>.github.io`。

限制：游戏里的反馈发不出去（没有接口）；国内访问慢。回滚同办法一。

## English

`.github/workflows/deploy-site.yml` builds the game with a relative base, assembles the site (landing page at `/`, game at `/play/`, commit hash in `/build.txt`) and publishes it on every push to `main` that touches the game or the landing page. The repository variable `SITE_DEPLOY` picks the target: unset builds only, `server` syncs to your own server with rsync over SSH (needs the `DEPLOY_*` secrets and the `DEPLOY_PATH` variable above), `pages` publishes to GitHub Pages. To roll back, run the workflow by hand with an older commit hash, or restore the entry pages kept under `.previous/` on the server.
