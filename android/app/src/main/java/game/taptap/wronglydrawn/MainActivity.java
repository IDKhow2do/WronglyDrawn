/**
 * [INPUT]: Android WebView、安装包网页资源和 HTTPS 反馈服务。
 * [OUTPUT]: 横屏游戏窗口、隐私选择与渲染退出后的恢复入口。站外的 https 链接（更新下载、GitHub）交给系统浏览器。
 *           用户代理末尾加 WronglyDrawnAndroid/<版本>，网页据此认出自己在 App 里（render/Quality.ts 的 ANDROID_APP）。
 * [POS]: 原生容器只负责载入和生命周期，玩法与反馈字段由网页实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package game.taptap.wronglydrawn;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
    private static final String GAME_HOST = "wrongdraw.maequeen.top";
    private static final String START_URL = "https://" + GAME_HOST + "/index.html";
    private WebView webView;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
        if (getPreferences(MODE_PRIVATE).getBoolean("privacy-v1", false)) {
            openGame();
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("隐私说明")
            .setMessage("游戏资源保存在安装包内，进度和设置保存在本机。\n\n"
                + "你主动提交反馈时，建议和当局游戏信息会通过 HTTPS 送至开发者服务器。"
                + "坐标指游戏内位置。硬件环境信息由你选择是否分享并确认。\n\n"
                + "可选 AI 搭档使用你自行填写的服务密钥。启用后，对话会发送至所选模型服务。"
                + "反馈和网络服务会产生普通网络访问记录。\n\n"
                + "可在 GitHub Issues 或 TapTap 的开发者联系入口提出反馈记录删除请求。"
                + "卸载应用会清除本机进度和设置。")
            .setPositiveButton("同意并继续", (dialog, which) -> {
                getPreferences(MODE_PRIVATE).edit().putBoolean("privacy-v1", true).apply();
                openGame();
            })
            .setNegativeButton("退出", (dialog, which) -> finish())
            .setCancelable(false)
            .show();
    }

    private void openGame() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(26, 20, 32));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " WronglyDrawnAndroid/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .setDomain(GAME_HOST)
            .addPathHandler("/", path -> assets.handle("game/" + path))
            .build();
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // 本地静态资源保留 HTTPS 源，反馈 POST 沿用站点 API。
                String path = request.getUrl().getPath();
                if (path != null && path.startsWith("/api/")) return null;
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("https".equals(target.getScheme()) && GAME_HOST.equals(target.getHost())) return false;
                // 更新提示的下载、GitHub 等外部链接交给系统浏览器；APK 在浏览器里下载，玩家点开覆盖安装。
                if ("https".equals(target.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, target));
                    } catch (ActivityNotFoundException ignored) {
                        // 没有浏览器：留在游戏里
                    }
                }
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                setContentView(new View(MainActivity.this));
                webView = null;
                view.destroy();
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("重新载入《错画之城》")
                    .setMessage("游戏画面中断了。重新载入后可继续游玩。")
                    .setPositiveButton("重新载入", (dialog, which) -> openGame())
                    .setNegativeButton("退出", (dialog, which) -> finish())
                    .setCancelable(false)
                    .show();
                return true;
            }
        });
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
