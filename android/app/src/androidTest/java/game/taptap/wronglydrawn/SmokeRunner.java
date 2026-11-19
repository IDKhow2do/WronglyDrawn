/**
 * [INPUT]: Android 测试进程、独立测试存储和 APK 内网页。
 * [OUTPUT]: 启动、App 标识、开机即触屏、无网页卡顿提示、WebGL 与帧率存储的验收结果。
 * [POS]: 通过 Android Instrumentation 覆盖原生资产映射，随测试包构建。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package game.taptap.wronglydrawn;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class SmokeRunner extends Instrumentation {
    private static final int BUNDLED_MODELS = 34;
    private WebView webView;

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        try {
            // 只为测试安装预置隐私选择，正式应用仍显示同意界面。
            getTargetContext().getSharedPreferences("MainActivity", 0).edit()
                .putBoolean("privacy-v1", true).commit();
            Intent launch = new Intent(getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(launch);
            runOnMainSync(() -> webView = findWebView(activity.getWindow().getDecorView()));
            if (webView == null) throw new AssertionError("Missing native WebView");
            waitFor("window.__WD?.state === 'TITLE'", 240000);
            // 缺文件时游戏换成占位模型、不报错，所以这里数清楚。改了 src/assets/manifest.ts 就改这个数。
            String models = evaluate("window.__WD.app.assets.models.size");
            if (!String.valueOf(BUNDLED_MODELS).equals(models)) {
                throw new AssertionError("Bundled model load: " + models + " of " + BUNDLED_MODELS);
            }
            require("/ WronglyDrawnAndroid\\//.test(navigator.userAgent)", "App user agent");
            // 不点屏幕：App 标识让触屏 HUD 在启动时就打开。
            require("innerWidth > innerHeight && window.__WD.app.input.touchMode", "Landscape touch mode from launch");
            require("!document.querySelector('.gfx-tip, .play-tip')", "No web-play lag tips in the app");
            evaluate("localStorage.setItem('wd.story',JSON.stringify({intro:1}));"
                + "document.querySelector('.start-btn').click();true");
            waitFor("document.querySelector('.su-go') || window.__WD.state !== 'TITLE'", 10000);
            evaluate("document.querySelector('.su-go')?.click();true");
            waitFor("window.__WD.state === 'PLAYING' && window.__WD.app.touch.active", 30000);
            require("!window.__WD.app.renderer.renderer.getContext().isContextLost()", "WebGL context");
            evaluate("window.dispatchEvent(new Event('blur'));true");
            waitFor("window.__WD.app.paused", 5000);
            evaluate("const fps=document.querySelector('.s-fps');fps.value='30';"
                + "fps.dispatchEvent(new Event('change',{bubbles:true}));true");
            require("localStorage.getItem('wd.fps') === '30'", "Frame rate preference");
            evaluate("document.querySelector('.resume').click();true");
            waitFor("!window.__WD.app.paused && window.__WD.app.touch.active", 5000);
            result.putString("stream", "PASS: bundled " + BUNDLED_MODELS + " models, app user agent, landscape touch mode from launch, no web lag tips, first level, WebGL, pause/resume and 30 FPS preference\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("stream", "FAIL: " + failure + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                WebView found = findWebView(group.getChildAt(index));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String evaluate(String javascript) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> output = new AtomicReference<>();
        runOnMainSync(() -> webView.evaluateJavascript(javascript, value -> {
            output.set(value);
            complete.countDown();
        }));
        if (!complete.await(90, TimeUnit.SECONDS)) throw new AssertionError("JavaScript callback timeout");
        return output.get();
    }

    private void waitFor(String expression, long timeout) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeout;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate("Boolean(" + expression + ")"))) return;
            SystemClock.sleep(250);
        }
        throw new AssertionError("Timed out: " + expression);
    }

    private void require(String expression, String name) throws Exception {
        if (!"true".equals(evaluate("Boolean(" + expression + ")"))) throw new AssertionError(name);
    }
}
