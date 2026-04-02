package com.journeyguard

import android.app.*
import android.content.*
import android.hardware.*
import android.media.MediaPlayer
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat

class ProtectionService : Service(), SensorEventListener {

    companion object {

        const val CHANNEL_ID = "jg_protection"
        const val NOTIF_ID = 1001
        const val ACTION_STOP = "STOP_PROTECTION"

        @Volatile
        var isRunning = false
            private set

        private const val TAG = "JourneyGuardService"
        private const val MOTION_THRESHOLD = 13.0
        private const val PICKUP_DEBOUNCE_MS = 5000L
        private const val SCREEN_OFF_SENSOR_DELAY_MS = 5000L
        private const val UNLOCK_GRACE_PERIOD_MS = 10000L
        private const val WARNING_VIBRATION_MS = 10000L
        private const val ALARM_VOLUME_STEP_DELAY_MS = 3000L
    }

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null

    private lateinit var keyguardManager: KeyguardManager

    private var alarmPlayer: MediaPlayer? = null
    private var pendingThreatCheck = false

    private var lastPickupTime = 0L
    private var monitoringActive = false

    private val handler = Handler(Looper.getMainLooper())

    private var currentVolume = 0.1f

    private var warningActive = false
    private val vibrator: Vibrator by lazy { getSystemService(Vibrator::class.java) }

    private val delayedStartRunnable = Runnable {
        if (isPhoneLocked()) {
            Log.d(TAG, "Delayed start of sensors after screen off")
            startSensors()
        }
    }

    private val gracePeriodRunnable = Runnable {
        pendingThreatCheck = false

        if (!isPhoneLocked() || alarmPlayer != null) {
            Log.d(TAG, "Grace period ended but phone is already safe")
            return@Runnable
        }

        Log.d(TAG, "Phone stayed locked for 10s after motion -> starting vibration warning")
        startWarningPhase()
    }

    private val warningTimeoutRunnable = Runnable {
        warningActive = false

        if (alarmPlayer == null && isPhoneLocked()) {
            Log.d(TAG, "Vibration warning ended and phone is still locked -> starting alarm")
            startAlarmGradually()
        }
    }

    private val powerReceiver = object : BroadcastReceiver() {

        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_POWER_DISCONNECTED) {
                Log.d(TAG, "Charging unplug detected")
                handleSuspiciousEvent()
            }
        }
    }

    private val usageReceiver = object : BroadcastReceiver() {

        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON -> {
                    Log.d(TAG, "Screen on -> pause monitoring")
                    stopSensors()
                }

                Intent.ACTION_USER_PRESENT -> {
                    Log.d(TAG, "Phone unlocked -> stop warning/alarm")

                    if (alarmPlayer != null) {
                        Log.d(TAG, "Alarm was active; stopping due to unlock")
                        stopAlarm()
                    }

                    handler.removeCallbacksAndMessages(null)
                    pendingThreatCheck = false
                    warningActive = false
                    vibrator.cancel()

                    stopSensors()
                }

                Intent.ACTION_SCREEN_OFF -> {
                    Log.d(TAG, "Screen off -> scheduling sensor start in 5s")
                    handler.postDelayed(delayedStartRunnable, SCREEN_OFF_SENSOR_DELAY_MS)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()

        if (isRunning) {
            stopSelf()
            return
        }

        isRunning = true

        try {
            keyguardManager = getSystemService(KeyguardManager::class.java)

            sensorManager = getSystemService(SensorManager::class.java)
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

            registerReceiver(
                powerReceiver,
                IntentFilter(Intent.ACTION_POWER_DISCONNECTED)
            )

            val screenFilter = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_USER_PRESENT)
            }

            registerReceiver(usageReceiver, screenFilter)

            createChannel()
            startForeground(NOTIF_ID, buildNotification())

            Log.d(TAG, "Protection service started")

            if (isPhoneLocked()) {
                Log.d(TAG, "Phone locked -> sensors started")
                startSensors()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Service start error", e)
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()

        try {
            unregisterReceiver(powerReceiver)
            unregisterReceiver(usageReceiver)

            stopSensors()
            stopAlarm()

            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }

        isRunning = false

        Log.d(TAG, "Protection service stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "Stop action received from notification")
            stopSelf()
            return START_NOT_STICKY
        }

        return START_STICKY
    }

    private fun startSensors() {
        if (monitoringActive) return

        accelerometer?.let {
            sensorManager.registerListener(
                this,
                it,
                SensorManager.SENSOR_DELAY_NORMAL
            )

            monitoringActive = true
            Log.d(TAG, "Sensors started")
        }
    }

    private fun stopSensors() {
        if (!monitoringActive) return

        sensorManager.unregisterListener(this)
        monitoringActive = false

        Log.d(TAG, "Sensors stopped")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (!monitoringActive) return
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        val movement = Math.sqrt((x * x + y * y + z * z).toDouble())
        Log.d(TAG, "Movement value: $movement")

        if (movement > MOTION_THRESHOLD) {
            val now = System.currentTimeMillis()

            if (now - lastPickupTime > PICKUP_DEBOUNCE_MS) {
                lastPickupTime = now
                Log.d(TAG, "Pickup detected")
                handleSuspiciousEvent()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun handleSuspiciousEvent() {
        if (!isPhoneLocked()) return

        if (alarmPlayer != null) {
            Log.d(TAG, "Additional suspicious event while alarm is active")
            return
        }

        if (warningActive) {
            Log.d(TAG, "Additional suspicious event during vibration warning -> starting alarm now")
            stopWarningPhase()
            startAlarmGradually()
            return
        }

        if (pendingThreatCheck) {
            Log.d(TAG, "Repeated suspicious event during grace period -> starting alarm now")
            cancelPendingThreatFlow()
            startAlarmGradually()
            return
        }

        pendingThreatCheck = true
        Log.d(TAG, "Suspicious event detected -> waiting 10s for unlock")
        handler.postDelayed(gracePeriodRunnable, UNLOCK_GRACE_PERIOD_MS)
    }

    private fun startWarningPhase() {
        warningActive = true
        vibrateWarning()
        handler.postDelayed(warningTimeoutRunnable, WARNING_VIBRATION_MS)
    }

    private fun stopWarningPhase() {
        handler.removeCallbacks(warningTimeoutRunnable)
        warningActive = false
        vibrator.cancel()
    }

    private fun cancelPendingThreatFlow() {
        handler.removeCallbacks(gracePeriodRunnable)
        pendingThreatCheck = false
        stopWarningPhase()
    }

    private fun vibrateWarning() {
        vibrator.cancel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(
                    WARNING_VIBRATION_MS,
                    VibrationEffect.DEFAULT_AMPLITUDE
                )
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(WARNING_VIBRATION_MS)
        }
    }

    private fun isPhoneLocked(): Boolean = keyguardManager.isKeyguardLocked

    private fun startAlarmGradually() {
        if (alarmPlayer != null) return
        if (!isPhoneLocked()) {
            Log.d(TAG, "startAlarmGradually called but phone is unlocked; aborting")
            return
        }

        cancelPendingThreatFlow()

        alarmPlayer = MediaPlayer.create(this, R.raw.alarm)
        alarmPlayer?.isLooping = true

        currentVolume = 0.1f
        alarmPlayer?.setVolume(currentVolume, currentVolume)
        alarmPlayer?.start()

        increaseVolume()
    }

    private fun increaseVolume() {
        handler.postDelayed({
            if (alarmPlayer == null) return@postDelayed

            if (!isPhoneLocked()) {
                stopAlarm()
                return@postDelayed
            }

            currentVolume += 0.1f
            if (currentVolume > 1f) currentVolume = 1f

            alarmPlayer?.setVolume(currentVolume, currentVolume)
            Log.d(TAG, "Alarm volume increased: $currentVolume")

            if (currentVolume < 1f) {
                increaseVolume()
            }
        }, ALARM_VOLUME_STEP_DELAY_MS)
    }

    private fun stopAlarm() {
        cancelPendingThreatFlow()

        alarmPlayer?.stop()
        alarmPlayer?.release()
        alarmPlayer = null

        Log.d(TAG, "Alarm stopped")
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, ProtectionService::class.java).apply {
            action = ACTION_STOP
        }

        val stopPendingIntent = PendingIntent.getService(
            this,
            0,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JourneyGuard Mobile Protection Active")
            .setContentText("Detecting motion while locked and protecting your phone")
            .setSmallIcon(R.drawable.ic_journeyguard_logo)
            .setOngoing(true)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                stopPendingIntent
            )
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val channel = NotificationChannel(
                CHANNEL_ID,
                "JourneyGuard Protection",
                NotificationManager.IMPORTANCE_LOW
            )

            manager.createNotificationChannel(channel)
        }
    }
}
