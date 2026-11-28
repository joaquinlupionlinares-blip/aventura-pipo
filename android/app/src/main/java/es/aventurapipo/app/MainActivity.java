package es.aventurapipo.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.Locale;

/**
 * La Aventura de Pipo: el juego (assets/index.html) dentro de un WebView.
 * El WebView de Android no trae speechSynthesis, así que la voz de Pipo
 * pasa por el TextToSpeech del propio móvil mediante el puente "AndroidTTS".
 */
public class MainActivity extends Activity {
    private static final int SKY = 0xFFCDEBFF;
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(SKY);
        web = new WebView(this);
        web.setBackgroundColor(SKY);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        styleSystemBars();

        // Que el juego no quede debajo de la barra de estado ni de la de navegación.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets.consumeSystemWindowInsets();
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // guardado del progreso (localStorage)
        s.setMediaPlaybackRequiresUserGesture(false); // música y efectos
        s.setAllowFileAccess(true);
        s.setTextZoom(100);                           // que el tamaño de letra del sistema no descuadre el juego
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidTTS");

        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (!ttsReady) return;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { fire(id, "end"); }
                @Override public void onError(String id) { fire(id, "error"); }
                @Override public void onStop(String id, boolean interrupted) { fire(id, "end"); }
            });
            web.post(() -> web.evaluateJavascript("window.__ttsReady&&window.__ttsReady()", null));
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    private void styleSystemBars() {
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(SKY);
            getWindow().setNavigationBarColor(SKY);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        } else if (Build.VERSION.SDK_INT >= 26) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        } else if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void fire(String id, String ev) {
        web.post(() -> web.evaluateJavascript("window.__ttsEvent&&window.__ttsEvent(" + JSONObject.quote(id) + ",'" + ev + "')", null));
    }

    /** Lo que el juego puede pedirle a la voz del móvil. */
    private class Bridge {
        @JavascriptInterface
        public boolean ready() { return ttsReady; }

        @JavascriptInterface
        public void speak(String id, String text, String lang, float rate, float pitch) {
            if (!ttsReady) { fire(id, "error"); return; }
            tts.setLanguage(Locale.forLanguageTag(lang == null || lang.isEmpty() ? "es-ES" : lang));
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            tts.speak(text, TextToSpeech.QUEUE_ADD, null, id);
        }

        @JavascriptInterface
        public void stop() { if (ttsReady) tts.stop(); }
    }

    /** Atrás vuelve a la pantalla anterior del juego; en el inicio, deja la app en segundo plano. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__back?window.__back():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { if (ttsReady) tts.stop(); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (tts != null) tts.shutdown(); web.destroy(); super.onDestroy(); }
}
