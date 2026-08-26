# ============================================================================
# proguard-rules.pro (app module)
# ProGuard / R8 rules for the main ET Mini Militia release build.
#
# These rules prevent the minifier from stripping or renaming classes that are
# accessed reflectively or via JNI by the Cocos Creator engine, platform SDKs,
# and Google services.
# ============================================================================

# --- Cocos Creator engine classes (accessed via reflection / JNI) ---
-keep public class com.cocos.** { *; }
-dontwarn com.cocos.**

# --- Apache HTTP client (legacy dependency used by some SDKs) ---
-keep class org.apache.http.** { *; }
-dontwarn org.apache.http.**

# --- OkHttp / Okio networking stack ---
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**

-keep class okio.** { *; }
-dontwarn okio.**

# --- Android WebView (used by in-game browser / ad webviews) ---
-keep public class android.net.http.SslError
-keep public class android.webkit.WebViewClient

-dontwarn android.webkit.WebView
-dontwarn android.net.http.SslError
-dontwarn android.webkit.WebViewClient

# --- Google Play Services / Ads / Firebase (accessed via reflection) ---
-keep public class com.google.** { *; }

# --- Auto-generated suppressions for newer Android API references ---
-dontwarn android.hardware.BatteryState
-dontwarn android.hardware.lights.Light
-dontwarn android.hardware.lights.LightState$Builder
-dontwarn android.hardware.lights.LightState
-dontwarn android.hardware.lights.LightsManager$LightsSession
-dontwarn android.hardware.lights.LightsManager
-dontwarn android.hardware.lights.LightsRequest$Builder
-dontwarn android.hardware.lights.LightsRequest
-dontwarn android.net.ssl.SSLSockets
-dontwarn android.os.VibratorManager
