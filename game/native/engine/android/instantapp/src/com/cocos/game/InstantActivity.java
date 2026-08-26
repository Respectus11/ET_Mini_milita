/****************************************************************************
Copyright (c) 2015-2016 Chukong Technologies Inc.
Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

http://www.cocos2d-x.org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
****************************************************************************/

/**
 * InstantActivity.java
 * Google Play Instant launcher Activity for ET Mini Militia.
 *
 * Functionally identical to AppActivity but declared as an Instant App entry
 * point in AndroidManifest.xml (dist:instant="true"). This allows users to
 * try the game directly from the Play Store without a full installation.
 *
 * All lifecycle callbacks are forwarded to SDKWrapper so that platform SDKs
 * (ads, analytics, IAP, etc.) remain synchronised regardless of which Activity
 * variant is active.
 */
package com.cocos.game;

import android.os.Bundle;
import android.content.Intent;
import android.content.res.Configuration;

import com.cocos.service.SDKWrapper;
import com.cocos.lib.CocosActivity;

/**
 * @class InstantActivity
 * @brief Instant App variant of the main Activity.
 *
 * Extends {@link CocosActivity} exactly like the standard AppActivity.
 * The only difference is the manifest metadata that marks this Activity as
 * an instant-app entry point. See {@code instantapp/AndroidManifest.xml}.
 */
public class InstantActivity extends CocosActivity {

    /**
     * Called when the Instant App Activity is first created.
     * Initialises the Cocos engine and the SDK integration layer.
     *
     * @param savedInstanceState persisted state from a previous instance, or null.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Initialise the platform SDK wrapper (ads, analytics, IAP, etc.)
        SDKWrapper.shared().init(this);
    }

    /** Resume the game engine and notify SDKs that the instant app is in the foreground. */
    @Override
    protected void onResume() {
        super.onResume();
        SDKWrapper.shared().onResume();
    }

    /** Pause the game engine and notify SDKs that the instant app went to the background. */
    @Override
    protected void onPause() {
        super.onPause();
        SDKWrapper.shared().onPause();
    }

    /**
     * Called when the Activity is being destroyed.
     *
     * Contains a workaround for an Android bug where pressing Home the first
     * time causes the Activity to relaunch instead of resuming.
     * @see <a href="https://stackoverflow.com/questions/16283079">StackOverflow reference</a>
     */
    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Workaround: avoid double-destroy when the activity is not the task root.
        if (!isTaskRoot()) {
            return;
        }
        SDKWrapper.shared().onDestroy();
    }

    /**
     * Forwards result data from an launched Intent (e.g. login, payment) to the SDK.
     */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        SDKWrapper.shared().onActivityResult(requestCode, resultCode, data);
    }

    /** Handles new Intents delivered while the Activity already exists (singleTask launch mode). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        SDKWrapper.shared().onNewIntent(intent);
    }

    /** Called after onStop when the Activity is brought back to the foreground. */
    @Override
    protected void onRestart() {
        super.onRestart();
        SDKWrapper.shared().onRestart();
    }

    /** Notify SDKs when the Activity is no longer visible. */
    @Override
    protected void onStop() {
        super.onStop();
        SDKWrapper.shared().onStop();
    }

    /** Intercept the hardware back button press before the default finish(). */
    @Override
    public void onBackPressed() {
        SDKWrapper.shared().onBackPressed();
        super.onBackPressed();
    }

    /** Notify SDKs of runtime configuration changes (locale, orientation, etc.). */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        SDKWrapper.shared().onConfigurationChanged(newConfig);
        super.onConfigurationChanged(newConfig);
    }

    /** Restore SDK-managed state after process death / recreation. */
    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        SDKWrapper.shared().onRestoreInstanceState(savedInstanceState);
        super.onRestoreInstanceState(savedInstanceState);
    }

    /** Persist SDK-managed state so it survives process death / recreation. */
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        SDKWrapper.shared().onSaveInstanceState(outState);
        super.onSaveInstanceState(outState);
    }

    /** Notify SDKs when the Activity becomes visible for the first time or after onStop. */
    @Override
    protected void onStart() {
        SDKWrapper.shared().onStart();
        super.onStart();
    }

    /** Called when the system is critically low on memory — release non-essential resources. */
    @Override
    public void onLowMemory() {
        SDKWrapper.shared().onLowMemory();
        super.onLowMemory();
    }
}
