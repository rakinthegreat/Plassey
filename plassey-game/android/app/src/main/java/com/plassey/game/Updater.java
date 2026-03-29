package com.plassey.game;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Updater {
    private static final String TAG = "PlasseyUpdater";
    private static final String GITHUB_API_URL = "https://api.github.com/repos/rakinthegreat/Plassey/releases/latest";
    private static final String PREFS_NAME = "UpdatePrefs";
    private static final String SKIP_VERSION_KEY = "SkipVersion";

    public static void checkForUpdates(final Context context) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Handler handler = new Handler(Looper.getMainLooper());

        executor.execute(() -> {
            try {
                // Get current version
                PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
                String currentVersion = pInfo.versionName;

                // Fetch latest release from GitHub
                URL url = URI.create(GITHUB_API_URL).toURL();
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json");

                if (conn.getResponseCode() == 200) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = in.readLine()) != null) {
                        response.append(line);
                    }
                    in.close();

                    JSONObject json = new JSONObject(response.toString());
                    String latestVersion = json.getString("tag_name");
                    String downloadUrl = json.getString("html_url"); // Fallback

                    // Try to find the app_release.apk asset
                    if (json.has("assets")) {
                        JSONArray assets = json.getJSONArray("assets");
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject asset = assets.getJSONObject(i);
                            String assetName = asset.getString("name");
                            if (assetName.equalsIgnoreCase("app_release.apk") || assetName.toLowerCase().endsWith(".apk")) {
                                downloadUrl = asset.getString("browser_download_url");
                                break;
                            }
                        }
                    }

                    // Check if update is needed
                    if (isNewer(latestVersion, currentVersion)) {
                        // Check if user skipped this version
                        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        String skipVersion = prefs.getString(SKIP_VERSION_KEY, "");

                        if (!latestVersion.equals(skipVersion)) {
                            final String finalUrl = downloadUrl;
                            handler.post(() -> showUpdateDialog(context, currentVersion, latestVersion, finalUrl));
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking for updates: " + e.getMessage());
            }
        });
    }

    private static boolean isNewer(String latest, String current) {
        if (latest == null || current == null) return false;
        
        // Remove leading 'v' if present
        String v1 = latest.startsWith("v") ? latest.substring(1) : latest;
        String v2 = current.startsWith("v") ? current.substring(1) : current;

        String[] latestParts = v1.split("\\.");
        String[] currentParts = v2.split("\\.");

        int length = Math.max(latestParts.length, currentParts.length);
        for (int i = 0; i < length; i++) {
            int l = i < latestParts.length ? Integer.parseInt(latestParts[i].replaceAll("[^0-9]", "")) : 0;
            int c = i < currentParts.length ? Integer.parseInt(currentParts[i].replaceAll("[^0-9]", "")) : 0;
            
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    }

    private static void showUpdateDialog(final Context context, String current, String latest, String url) {
        new AlertDialog.Builder(context)
                .setTitle("Strategic Update Available")
                .setMessage("Your current version is " + current + ", but a new maneuver (version " + latest + ") has been executed. Would you like to update?")
                .setPositiveButton("Update", (dialog, which) -> {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    context.startActivity(intent);
                })
                .setNegativeButton("Later", (dialog, which) -> dialog.dismiss())
                .setNeutralButton("Skip this version", (dialog, which) -> {
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(SKIP_VERSION_KEY, latest).apply();
                    dialog.dismiss();
                })
                .setIcon(android.R.drawable.ic_dialog_info)
                .show();
    }
}
