package com.pico.nameart;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Brings the booth back after a restart.
 *
 * Android 10 and later block most background activity starts, so this alone is not enough to
 * guarantee the booth reappears - the reliable route is the HOME intent filter on MainActivity,
 * which makes the tablet launch the booth as its home screen. This covers the case where the app
 * is not the chosen home app, and costs nothing when it is.
 *
 * The receiver must be exported: BOOT_COMPLETED is delivered by the system, and an unexported
 * receiver simply never hears it.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : String.valueOf(intent.getAction());
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        try {
            Intent booth = new Intent(context, MainActivity.class);
            booth.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(booth);
            Log.i("NameArt", "booth relaunched after " + action);
        } catch (Exception error) {
            // Blocked background starts are expected on newer Android; HOME is what carries it.
            Log.i("NameArt", "boot relaunch blocked: " + error.getMessage());
        }
    }
}
