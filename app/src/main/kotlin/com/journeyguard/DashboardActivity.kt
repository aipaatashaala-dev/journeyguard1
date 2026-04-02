package com.journeyguard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.journeyguard.databinding.ActivityDashboardBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var locationManager: LocationManager

    companion object {
        private const val LOCATION_REQUEST_CODE = 200
    }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) {
            val speedKmh = loc.speed * 3.6f
            binding.speedText.text = "${String.format(Locale.getDefault(), "%.1f", speedKmh)} km/h"
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

        override fun onProviderEnabled(provider: String) {}

        override fun onProviderDisabled(provider: String) {}
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        ensureLocationPermission()

        setupButtons()
        updateUI()
        displayAccountInfo()
    }

    private fun displayAccountInfo() {
        val prefs = getSharedPreferences("auth", Context.MODE_PRIVATE)
        val imei = prefs.getString("imei", "Not set")
        binding.imeiText.text = "IMEI: $imei"

        val username = prefs.getString("user", "User")
        val phone = prefs.getString("phone", "Not provided")
        val createdAt = prefs.getLong("created_at", 0)

        val dateStr = if (createdAt > 0) {
            SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(createdAt))
        } else {
            "Not available"
        }

        binding.userDetailsText.text = """
            Account Details
            ------------------------------
            Name: $username
            Phone: $phone
            IMEI: $imei
            Joined: $dateStr
        """.trimIndent()
    }

    private fun setupButtons() {
        binding.btnStartProtection.setOnClickListener {
            if (ProtectionService.isRunning) {
                Toast.makeText(this, "Mobile protection is already running", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val prefs = getSharedPreferences("auth", Context.MODE_PRIVATE)
            val imei = prefs.getString("imei", null)

            if (imei.isNullOrEmpty()) {
                Toast.makeText(this, "IMEI not set. Please update your profile.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            showProtectionDialog(imei)
        }

        binding.btnStopProtection.setOnClickListener {
            if (!ProtectionService.isRunning) {
                Toast.makeText(this, "Mobile protection is not running", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            stopService(Intent(this, ProtectionService::class.java))
            Toast.makeText(this, "Mobile protection stopped", Toast.LENGTH_SHORT).show()
            updateUI()
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
        """.trimIndent()

        AlertDialog.Builder(this)
            .setTitle("Enable Mobile Protection")
            .setMessage(message)
            .setPositiveButton("Enable") { _, _ ->
                startProtectionService()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun startProtectionService() {
        try {
            val intent = Intent(this, ProtectionService::class.java)
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Mobile protection enabled", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to start mobile protection", Toast.LENGTH_SHORT).show()
        }
        updateUI()
    }

    private fun updateUI() {
        val running = ProtectionService.isRunning
        binding.serviceStatusText.text = if (running) {
            getString(R.string.service_running)
        } else {
            getString(R.string.service_stopped)
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
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        locationManager.removeUpdates(locationListener)
    }
}
