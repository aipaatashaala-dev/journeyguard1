package com.journeyguard

import android.os.Build
import android.os.Bundle
import android.telephony.TelephonyManager
import android.util.Patterns
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.ktx.auth
import com.google.firebase.database.ktx.database
import com.google.firebase.ktx.Firebase
import com.journeyguard.databinding.ActivityRegisterBinding
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class RegisterActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRegisterBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        JourneyGuardFirebase.ensureInitialized(this)

        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        try {
            val imei = getDeviceIMEI()
            if (imei != null) {
                binding.etIMEI.setText(imei)
            }
        } catch (_: Exception) {
        }

        binding.btnIMEIInfo.setOnClickListener {
            val visibility = if (binding.tvIMEIGuide.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            binding.tvIMEIGuide.visibility = visibility
        }

        binding.btnRegisterConfirm.setOnClickListener {
            val email = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()
            val phone = binding.etPhone.text.toString().trim()
            val imei = binding.etIMEI.text.toString().trim()

            when {
                email.isEmpty() || password.isEmpty() || phone.isEmpty() || imei.isEmpty() ->
                    Toast.makeText(this, getString(R.string.register_fill_required), Toast.LENGTH_SHORT).show()
                !Patterns.EMAIL_ADDRESS.matcher(email).matches() ->
                    Toast.makeText(this, getString(R.string.register_invalid_email), Toast.LENGTH_SHORT).show()
                imei.length < 14 ->
                    Toast.makeText(this, "IMEI must be at least 14 digits", Toast.LENGTH_SHORT).show()
                else -> registerAccount(email, password, phone, imei)
            }
        }
    }

    private fun registerAccount(email: String, password: String, phone: String, imei: String) {
        lifecycleScope.launch {
            try {
                binding.btnRegisterConfirm.isEnabled = false
                val result = Firebase.auth.createUserWithEmailAndPassword(email, password).await()
                val uid = result.user?.uid ?: error("No user ID")

                Firebase.database.reference.child("users").child(uid).updateChildren(
                    mapOf(
                        "email" to email,
                        "display_name" to email.substringBefore("@"),
                        "mobile_number" to phone,
                        "imei" to imei,
                        "created_at" to System.currentTimeMillis(),
                    )
                ).await()

                getSharedPreferences("auth", MODE_PRIVATE)
                    .edit()
                    .putString("email", email)
                    .putString("phone", phone)
                    .putString("imei", imei)
                    .putLong("created_at", System.currentTimeMillis())
                    .apply()

                Toast.makeText(
                    this@RegisterActivity,
                    "Account created. You can now use the same protection account on web and phone.",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            } catch (e: Exception) {
                Toast.makeText(
                    this@RegisterActivity,
                    e.message ?: "Registration failed",
                    Toast.LENGTH_SHORT
                ).show()
            } finally {
                binding.btnRegisterConfirm.isEnabled = true
            }
        }
    }

    @Suppress("MissingPermission")
    private fun getDeviceIMEI(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                null
            } else {
                val telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
                @Suppress("DEPRECATION")
                telephonyManager.imei ?: telephonyManager.deviceId
            }
        } catch (_: Exception) {
            null
        }
    }
}
