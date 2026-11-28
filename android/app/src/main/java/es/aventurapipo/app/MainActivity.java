package es.aventurapipo.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
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

import java.io.OutputStream;
import java.util.Locale;

/**
 * La Aventura de Juanma: el juego (assets/index.html) dentro de un WebView.
 * El WebView no trae speechSynthesis: la voz pasa por el TextToSpeech del dispositivo mediante "AndroidTTS".
 * - Español: la voz natural (motor sherpa-onnx con una voz Piper) si está instalada; si no, la del sistema.
 * - Inglés: siempre la voz del sistema (la voz natural española no sabe inglés).
 * No se usa micrófono ni se envía nada a internet.
 */
public class MainActivity extends Activity {
    private static final int SKY = 0xFFCDEBFF;
    private static final String NATURAL = "com.k2fsa.sherpa.onnx.tts.engine";
    private WebView web;
    private TextToSpeech esTts, enTts;
    private volatile boolean esReady = false, enReady = false;
    private boolean natural = false;

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
        s.setDomStorageEnabled(true);                 // perfiles, progreso y dibujos (localStorage)
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

        natural = installed(NATURAL);
        esTts = natural ? new TextToSpeech(this, st -> onReady(true, st), NATURAL) : new TextToSpeech(this, st -> onReady(true, st));
        enTts = new TextToSpeech(this, st -> onReady(false, st));

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    private boolean installed(String pkg) {
        try { getPackageManager().getPackageInfo(pkg, 0); return true; }
        catch (PackageManager.NameNotFoundException e) { return false; }
    }

    private void onReady(boolean es, int status) {
        boolean ok = status == TextToSpeech.SUCCESS;
        TextToSpeech t = es ? esTts : enTts;
        if (es) esReady = ok; else enReady = ok;
        if (!ok) return;
        t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { fire(id, "end"); }
            @Override public void onError(String id) { fire(id, "error"); }
            @Override public void onStop(String id, boolean interrupted) { fire(id, "end"); }
        });
        if (es) web.post(() -> web.evaluateJavascript("window.__ttsReady&&window.__ttsReady()", null));
    }

    private void styleSystemBars() {
        getWindow().setStatusBarColor(SKY);
        getWindow().setNavigationBarColor(SKY);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        } else if (Build.VERSION.SDK_INT >= 26) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void fire(String id, String ev) {
        web.post(() -> web.evaluateJavascript("window.__ttsEvent&&window.__ttsEvent(" + JSONObject.quote(id) + ",'" + ev + "')", null));
    }

    /** Lo que el juego puede pedirle al dispositivo. */
    private class Bridge {
        @JavascriptInterface
        public boolean ready() { return esReady; }

        @JavascriptInterface
        public void speak(String id, String text, String lang, float rate, float pitch) {
            boolean en = lang != null && lang.toLowerCase(Locale.ROOT).startsWith("en");
            TextToSpeech t = en ? enTts : esTts;
            if (!(en ? enReady : esReady)) { fire(id, "error"); return; }
            t.setLanguage(Locale.forLanguageTag(en ? lang : "es-ES"));
            t.setSpeechRate(rate);
            t.setPitch(pitch);
            Bundle p = new Bundle();
            t.speak(text, TextToSpeech.QUEUE_ADD, p, id);
        }

        @JavascriptInterface
        public void stop() {
            if (esReady) esTts.stop();
            if (enReady) enTts.stop();
        }

        /** Qué voz española se está usando, para el área de mayores. */
        @JavascriptInterface
        public String engineInfo() {
            return natural
                ? "Voz natural de Pipo instalada (motor sherpa-onnx). El inglés usa la voz del sistema."
                : "Usando la voz del sistema. Para la voz natural de Pipo, instala en la tablet el motor de voz que viene con el juego (ver guía).";
        }

        /** Guarda un dibujo (data:image/png;base64,...) en Imágenes/Juanma. Devuelve true si ha ido bien. */
        @JavascriptInterface
        public boolean saveImage(String dataUrl, String name) {
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                byte[] png = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Juanma");
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return false;
                try (OutputStream o = getContentResolver().openOutputStream(uri)) { o.write(png); }
                return true;
            } catch (Exception e) { return false; }
        }
    }

    /** Atrás vuelve a la pantalla anterior del juego; en la entrada, deja la app en segundo plano. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__back?window.__back():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { if (esReady) esTts.stop(); if (enReady) enTts.stop(); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (esTts != null) esTts.shutdown(); if (enTts != null) enTts.shutdown(); web.destroy(); super.onDestroy(); }
}
