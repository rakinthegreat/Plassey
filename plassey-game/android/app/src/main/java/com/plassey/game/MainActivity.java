package com.plassey.game;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_REQUEST_CODE = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sequence permissions: Notification first (API 33+), then Battery Optimization for background link stability
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST_CODE);
            } else {
                checkBatteryOptimization();
            }
        } else {
            checkBatteryOptimization();
        }

        // Check for updates in background
        Updater.checkForUpdates(this);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
            @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_REQUEST_CODE) {
            // After notification result is received, check battery optimization status
            checkBatteryOptimization();
        }
    }

    @SuppressLint("ObsoleteSdkInt")
    private void checkBatteryOptimization() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            String packageName = getPackageName();
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                showBatteryOptimizationDialog();
            }
        }
    }

    private void showBatteryOptimizationDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Background Link Stability")
                .setMessage(
                        "Plassey 1757 requires background activity to maintain your tactical link (WebRTC) during maneuvers. Please select 'Allow' in the next prompt to ensure uninterrupted gameplay.")
                .setPositiveButton("Proceed", new DialogInterface.OnClickListener() {
                    @SuppressLint("BatteryLife")
                    public void onClick(DialogInterface dialog, int which) {
                        Intent intent = new Intent();
                        intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    }
                })
                .setNegativeButton("Later", null)
                .show();
    }
}
