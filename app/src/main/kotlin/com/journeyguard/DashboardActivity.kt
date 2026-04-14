package com.journeyguard

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.ktx.auth
import com.google.firebase.database.ktx.database
import com.google.firebase.ktx.Firebase
import com.journeyguard.databinding.ActivityDashboardBinding
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var locationManager: LocationManager
    private val syncHandler = Handler(Looper.getMainLooper())
    private var lastRemoteState: RemoteProtectionState? = null
    private var lastKnownLocation: Location? = null

    companion object {
        private const val LOCATION_REQUEST_CODE = 200
        private const val NOTIFICATION_REQUEST_CODE = 201
        private const val REMOTE_SYNC_INTERVAL_MS = 4000L
    }

    private val syncRunnable = object : Runnable {
        override fun run() {
            syncRemoteState()
            syncHandler.postDelayed(this, REMOTE_SYNC_INTERVAL_MS)
        }
    }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) {
            lastKnownLocation = loc
            val speedKmh = loc.speed * 3.6f
            binding.speedText.text = "${String.format(Locale.getDefault(), "%.1f", speedKmh)} km/h"

            val shouldSyncLocation = lastRemoteState?.locationEnabled == true || lastRemoteState?.active == true
            if (shouldSyncLocation) {
                pushLocationUpdate(loc)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

        override fun onProviderEnabled(provider: String) {}

        override fun onProviderDisabled(provider: String) {}
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        JourneyGuardFirebase.ensureInitialized(this)

        if (Firebase.auth.currentUser == null) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        ensureLocationPermission()
        ensureNotificationPermission()

        setupButtons()
        updateUI()
        loadAccountInfo()
        syncRemoteState(showFailureToast = true)
    }

    override fun onStart() {
        super.onStart()
        syncHandler.post(syncRunnable)
    }

    override fun onStop() {
        super.onStop()
        syncHandler.removeCallbacks(syncRunnable)
    }

    private fun loadAccountInfo() {
        val currentUser = Firebase.auth.currentUser
        val fallbackEmail = currentUser?.email ?: "Not available"

        lifecycleScope.launch {
            try {
                val uid = currentUser?.uid ?: return@launch
                val snapshot = Firebase.database.reference.child("users").child(uid).get().await()
                val profile = snapshot.value as? Map<*, *>

                val phone = profile?.get("mobile_number")?.toString()
                    ?: getSharedPreferences("auth", MODE_PRIVATE).getString("phone", "Not provided")
                    ?: "Not provided"
                val imei = profile?.get("imei")?.toString()
                    ?: getSharedPreferences("auth", MODE_PRIVATE).getString("imei", "Not set")
                    ?: "Not set"
                val createdAt = when (val value = profile?.get("created_at")) {
                    is Long -> value
                    is Double -> value.toLong()
                    is String -> value.toLongOrNull() ?: 0L
                    else -> getSharedPreferences("auth", MODE_PRIVATE).getLong("created_at", 0L)
                }

                val dateStr = if (createdAt > 0) {
                    SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(createdAt))
                } else {
                    "Not available"
                }

                binding.imeiText.text = getString(R.string.imei_label, imei)
                binding.userDetailsText.text = getString(
                    R.string.account_details_format,
                    fallbackEmail,
                    phone,
                    imei,
                    dateStr
                )
            } catch (_: Exception) {
                binding.userDetailsText.text = getString(
                    R.string.account_details_format,
                    fallbackEmail,
                    "Not provided",
                    "Not set",
                    "Not available"
                )
            }
        }
    }

    private fun setupButtons() {
        binding.btnStartProtection.setOnClickListener {
            val imeiText = binding.imeiText.text?.toString().orEmpty()
            showProtectionDialog(imeiText.removePrefix("IMEI: ").ifBlank { "Not set" })
        }

        binding.btnStopProtection.setOnClickListener {
            lifecycleScope.launch {
                try {
                    ProtectionRemoteApi.stopProtection()
                    stopProtectionService()
                    lastRemoteState = lastRemoteState?.copy(active = false, source = "mobile-device")
                    updateUI()
                    Toast.makeText(this@DashboardActivity, "Mobile protection stopped", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(
                        this@DashboardActivity,
                        getString(R.string.remote_sync_error),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }

        binding.btnSupport.setOnClickListener {
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = android.net.Uri.parse("mailto:${getString(R.string.support_email)}")
            }
            startActivity(intent)
        }
    }

    private fun showProtectionDialog(imei: String) {
        val message = """
            Enable mobile protection for this device?

            IMEI: $imei

            Protection flow:
            1. Motion is detected from the phone sensors while the phone is locked.
            2. JourneyGuard waits 10 seconds for you to unlock it.
            3. If still locked, it vibrates for 10 seconds.
            4. The alarm then keeps ringing until you unlock the phone.
            5. The protection page on another logged-in device can see the same state remotely.
        """.trimIndent()

        AlertDialog.Builder(this)
            .setTitle("Enable Mobile Protection")
            .setMessage(message)
            .setPositiveButton("Enable") { _, _ ->
                startProtectionFromPhone()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun startProtectionFromPhone() {
        lifecycleScope.launch {
            try {
                val locationEnabled = ContextCompat.checkSelfPermission(
                    this@DashboardActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED

                lastRemoteState = ProtectionRemoteApi.startProtection(locationEnabled)
                startProtectionService()
                lastKnownLocation?.let { pushLocationUpdate(it) }
                updateUI()
                Toast.makeText(
                    this@DashboardActivity,
                    "Mobile protection enabled and synced with your protection page",
                    Toast.LENGTH_SHORT
                ).show()
            } catch (e: Exception) {
                Toast.makeText(
                    this@DashboardActivity,
                    e.message ?: getString(R.string.remote_sync_error),
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun startProtectionService() {
        val intent = Intent(this, ProtectionService::class.java)
        ContextCompat.startForegroundService(this, intent)
        ProtectionPreferences.setProtectionExpected(this, true)
    }

    private fun stopProtectionService() {
        stopService(Intent(this, ProtectionService::class.java))
        ProtectionPreferences.setProtectionExpected(this, false)
    }

    private fun syncRemoteState(showFailureToast: Boolean = false) {
        lifecycleScope.launch {
            try {
                val state = ProtectionRemoteApi.getProtectionState()
                lastRemoteState = state
                ProtectionPreferences.setProtectionExpected(this@DashboardActivity, state.active)

                val ringRequested = state.ringRequestedAt > state.ringStopRequestedAt

                if ((state.active || ringRequested) && !ProtectionService.isRunning) {
                    startProtectionService()
                } else if (!state.active && ProtectionService.isRunning) {
                    if (!ringRequested) {
                        stopProtectionService()
                    }
                }

                updateUI()
            } catch (_: Exception) {
                if (showFailureToast) {
                    Toast.makeText(
                        this@DashboardActivity,
                        getString(R.string.remote_sync_error),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun pushLocationUpdate(location: Location) {
        lifecycleScope.launch {
            runCatching {
                lastRemoteState = ProtectionRemoteApi.updateProtectionLocation(
                    lat = location.latitude,
                    lng = location.longitude,
                    accuracy = location.accuracy,
                    locationEnabled = true
                )
                updateUI()
            }
        }
    }

    private fun updateUI() {
        val remoteState = lastRemoteState
        val running = remoteState?.active ?: ProtectionService.isRunning

        binding.serviceStatusText.text = when {
            remoteState == null && running -> getString(R.string.sync_active_local)
            remoteState == null -> getString(R.string.sync_waiting)
            remoteState.active -> getString(R.string.sync_active_remote)
            else -> getString(R.string.sync_stopped_remote)
        }

        binding.protectionBanner.apply {
            text = if (running) {
                getString(R.string.protection_started_banner)
            } else {
                getString(R.string.protection_stopped_banner)
            }
            setBackgroundResource(
                if (running) R.color.secondary else R.color.card_dark
            )
        }

        binding.btnStartProtection.isEnabled = !running
        binding.btnStopProtection.isEnabled = running
    }

    private fun ensureLocationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                LOCATION_REQUEST_CODE
            )
        } else {
            startLocationUpdates()
        }
    }

    private fun ensureNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_REQUEST_CODE
            )
        }
    }

    private fun startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                1000L,
                0f,
                locationListener
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startLocationUpdates()
            } else {
                Toast.makeText(this, "Location permission required for speed", Toast.LENGTH_SHORT).show()
            }
        } else if (requestCode == NOTIFICATION_REQUEST_CODE) {
            if (grantResults.isEmpty() || grantResults[0] != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, R.string.notification_permission_denied, Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        locationManager.removeUpdates(locationListener)
        syncHandler.removeCallbacks(syncRunnable)
    }
}
