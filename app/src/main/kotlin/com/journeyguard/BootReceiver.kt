package com.journeyguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "JourneyGuardBoot"
    }

    override fun onReceive(context: Context, intent: Intent?) {

        val action = intent?.action ?: return

        Log.d(TAG, "BootReceiver triggered: $action")

        // Boot / restart events we want to handle
        val bootActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED
        )

        if (!bootActions.contains(action)) {
            return
        }

        try {
            // simply start the protection service after boot if not already running
            if (ProtectionService.isRunning) {
                Log.d(TAG, "ProtectionService already running")
                return
            }

            Log.d(TAG, "Starting ProtectionService after boot")

            val serviceIntent = Intent(context, ProtectionService::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start ProtectionService after boot", e)
        }
    }
}