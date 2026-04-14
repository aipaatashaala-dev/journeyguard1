package com.journeyguard

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase
import com.journeyguard.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        JourneyGuardFirebase.ensureInitialized(this)

        if (Firebase.auth.currentUser != null) {
            startActivity(Intent(this, DashboardActivity::class.java))
            finish()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnLogin.setOnClickListener {
            val email = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, getString(R.string.login_fill_required), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
                Toast.makeText(this, getString(R.string.register_invalid_email), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                try {
                    binding.btnLogin.isEnabled = false
                    Firebase.auth.signInWithEmailAndPassword(email, password).await()
                    startActivity(Intent(this@MainActivity, DashboardActivity::class.java))
                    finish()
                } catch (_: Exception) {
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.login_invalid),
                        Toast.LENGTH_SHORT
                    ).show()
                } finally {
                    binding.btnLogin.isEnabled = true
                }
            }
        }

        binding.btnRegister.setOnClickListener {
            startActivity(Intent(this, RegisterActivity::class.java))
        }
    }
}
