package com.journeyguard

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.telephony.TelephonyManager
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.journeyguard.databinding.ActivityRegisterBinding

class RegisterActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRegisterBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Try to auto-detect IMEI if available
        try {
            val imei = getDeviceIMEI()
            if (imei != null) {
                binding.etIMEI.setText(imei)
            }
        } catch (e: Exception) {
            // If not available, user will enter manually
        }

        // Toggle IMEI guide visibility
        binding.btnIMEIInfo.setOnClickListener {
            val visibility = if (binding.tvIMEIGuide.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            binding.tvIMEIGuide.visibility = visibility
        }

        binding.btnRegisterConfirm.setOnClickListener {
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val phone = binding.etPhone.text.toString().trim()
            val imei = binding.etIMEI.text.toString().trim()

            when {
                username.isEmpty() || password.isEmpty() || phone.isEmpty() || imei.isEmpty() -> 
                    Toast.makeText(this, "Fill all fields including Phone and IMEI", Toast.LENGTH_SHORT).show()
                imei.length < 14 -> 
                    Toast.makeText(this, "IMEI must be at least 14 digits", Toast.LENGTH_SHORT).show()
                else -> {
                    val prefs = getSharedPreferences("auth", Context.MODE_PRIVATE)
                    prefs.edit()
                        .putString("user", username)
                        .putString("pass", password)
                        .putString("phone", phone)
                        .putString("imei", imei)
                        .putLong("created_at", System.currentTimeMillis())
                        .apply()
                    Toast.makeText(this, "Registered successfully. Details saved.", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }

    @Suppress("MissingPermission")
    private fun getDeviceIMEI(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ requires READ_PRIVILEGED_PHONE_STATE or device admin
                null
            } else {
                val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                @Suppress("DEPRECATION")
                telephonyManager.imei ?: telephonyManager.deviceId
            }
        } catch (e: Exception) {
            null
        }
    }
}
